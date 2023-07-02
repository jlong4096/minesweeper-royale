import { APIGatewayProxyWebsocketEventV2, Context } from 'aws-lambda';

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  UpdateCommand,
  UpdateCommandInput
} from '@aws-sdk/lib-dynamodb';

const apigClient = new ApiGatewayManagementApiClient({
  region: process.env.REGION,
  endpoint: process.env.API_GW_ENDPOINT
});

const dbClient = new DynamoDBClient({ region: process.env.REGION });
const dynamodb = DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.GAME_TABLE_NAME;
const PrimaryKey = process.env.PRIMARY_KEY || 'id';

// Incoming messages
interface ReadyMessage {
  event: 'READY';
  gameId: string;
}

interface ActionMessage {
  event: 'ACTION';
  gameId: string;
  left?: { x: number; y: number };
  right?: { x: number; y: number };
}

// Outgoing messages
interface JoinedMessage {
  event: 'JOINED';
  connectionId: string;
  allConnectionIds: string[];
}

interface WelcomeMessage {
  event: 'WELCOME';
  newConnectionId: string;
}

interface AnnounceMessage extends ActionMessage {
  connectionId: string;
}

async function deleteConnections(gameId: string, connectionIds: string[]) {
  console.log(`disconnection from ${connectionIds.join(', ')}`);

  const params: UpdateCommandInput = {
    TableName,
    Key: { [PrimaryKey]: gameId },
    UpdateExpression: 'DELETE #con :removeConnection',
    ExpressionAttributeNames: { '#con': 'connections' },
    ExpressionAttributeValues: { ':removeConnection': new Set(connectionIds) }
  };

  await dynamodb.send(new UpdateCommand(params));
}

async function sendToAll(gameId: string, connections: string[], body: string) {
  // Send a message to the clients
  console.log(`sending to ${connections.length}`);

  // Array to hold any 410 errors.
  const goneConnections: string[] = [];

  const promises = connections.map(async (connectionId) => {
    const postCommand = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: body
    });

    try {
      await apigClient.send(postCommand);
    } catch (error: any) {
      if (error.statusCode === 410) {
        // Connection is no longer available. Add it to the goneConnections array.
        goneConnections.push(connectionId);
      } else {
        // Other error. You might want to handle this differently.
        console.error(
          `Failed to send message to connection ${connectionId}:`,
          error
        );
      }
    }
  });

  await Promise.all(promises);

  if (goneConnections.length) {
    deleteConnections(gameId, goneConnections);
  }
}

async function handleNewConnection(connectionId: string, action: ReadyMessage) {
  // Store connectionId
  console.log(`connection from ${connectionId} for ${action.gameId}`);

  const params: UpdateCommandInput = {
    TableName,
    Key: {
      [PrimaryKey]: action.gameId
    },
    UpdateExpression: 'ADD #con :newConnection',
    ExpressionAttributeNames: { '#con': 'connections' },
    ExpressionAttributeValues: {
      ':newConnection': new Set([connectionId])
    },
    ReturnValues: 'ALL_NEW'
  };

  const { Attributes } = await dynamodb.send(new UpdateCommand(params));
  console.log(Attributes);
  const connections = Array.from(Attributes?.connections) as string[];
  if (!connections) {
    throw new Error('Failed to add connection to game');
  }

  // Let cliet know connectionId
  const joinedMsg: JoinedMessage = {
    event: 'JOINED',
    connectionId,
    allConnectionIds: connections
  };

  const postCommand = new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify(joinedMsg)
  });
  try {
    await apigClient.send(postCommand);
  } catch (error: any) {
    if (error.statusCode === 410) {
      deleteConnections(action.gameId, [connectionId]);
    } else {
      // Other error. You might want to handle this differently.
      console.error(
        `Failed to send initial message to connection ${connectionId}:`,
        error
      );
    }
  }
  // Announce new connection to others
  const welcomeMsg: WelcomeMessage = {
    event: 'WELCOME',
    newConnectionId: connectionId
  };
  await sendToAll(
    action.gameId,
    connections.filter((c) => c !== connectionId),
    JSON.stringify(welcomeMsg)
  );
}

async function handleActionEvent(connectionId: string, action: ActionMessage) {
  const gameId = action.gameId;

  const params: GetCommandInput = {
    TableName,
    Key: { [PrimaryKey]: action.gameId },
    ProjectionExpression: 'connections'
  };

  const connections: string[] = [];
  try {
    const { Item } = await dynamodb.send(new GetCommand(params));
    if (Item) {
      connections.push(...Item.connections);
    }
  } catch (err: any) {
    console.error(
      `cannot get connections from gameId ${action.gameId}:  ${err}`
    );
    throw err;
  }

  const msg: AnnounceMessage = { ...action, event: 'ACTION', connectionId };

  await sendToAll(gameId, connections, JSON.stringify(msg));
}

exports.handler = async function (
  event: APIGatewayProxyWebsocketEventV2,
  context: Context
) {
  const connectionId = event.requestContext.connectionId;

  if (event.requestContext.eventType === 'MESSAGE') {
    const action = JSON.parse(event.body || '{}');
    console.log(
      `message ${event.body} received from ${connectionId} for ${action.gameId}`
    );

    // TODO:   Game should "lock down" when all clients connect and has started.
    // This means that we should be able to query for the available connections once
    // for the life of the game or life of the lambda function.
    // Until then, doing expensive look-ups with each message.

    if (action.event === 'READY') {
      await handleNewConnection(connectionId, action);
    } else if (action.event === 'ACTION') {
      await handleActionEvent(connectionId, action);
    }
  }

  return { statusCode: 200, body: 'Data processed' };
};
