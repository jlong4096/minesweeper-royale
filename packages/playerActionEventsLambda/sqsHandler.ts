import { SQSEvent } from 'aws-lambda';

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  BatchWriteCommandInput,
  PutCommand,
  PutCommandInput,
  QueryCommand,
  QueryCommandInput
} from '@aws-sdk/lib-dynamodb';

import {
  JoinedMessage,
  LeftMessage,
  WelcomeMessage,
  AnnounceMessage
} from 'playerActions-lib';

const apigClient = new ApiGatewayManagementApiClient({
  region: process.env.REGION,
  endpoint: process.env.API_GW_ENDPOINT
});

const dbClient = new DynamoDBClient({ region: process.env.REGION });
const dynamodb = DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.CONNECTIONS_TABLE_NAME || 'ConnectionsTable';
const PrimaryKey = process.env.PRIMARY_KEY || 'gameId';

async function deleteConnections(
  gameId: string,
  removeIds: string[],
  connectionIds?: string[]
) {
  console.log(`disconnection from ${removeIds.join(', ')}`);

  const leftMsg: LeftMessage = {
    event: 'LEFT',
    connectionIds: removeIds
  };

  if (Array.isArray(connectionIds) && connectionIds.length) {
    const remainingIds = connectionIds.filter((id) => !removeIds.includes(id));
    await sendToAll(gameId, remainingIds, JSON.stringify(leftMsg), false);
  }

  console.log('deleting connections');

  const requests = removeIds.map((connectionId) => ({
    DeleteRequest: {
      Key: {
        [PrimaryKey]: gameId,
        connectionId
      }
    }
  }));

  const params: BatchWriteCommandInput = {
    RequestItems: {
      [TableName]: requests
    }
  };

  const res = await dynamodb.send(new BatchWriteCommand(params));

  const insertCount =
    removeIds.length - (res.UnprocessedItems?.[TableName] || []).length;

  if (insertCount < removeIds.length) {
    console.warn(
      `Failed to remove ${removeIds.length - insertCount} connections`
    );
  } else {
    console.log(`Successfully removed ${insertCount} connections`);
  }
}

async function sendToAll(
  gameId: string,
  connections: string[],
  body: string,
  autoDisconnect = true
) {
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

  if (autoDisconnect && goneConnections.length) {
    await deleteConnections(gameId, goneConnections, connections);
  }
}

async function handleNewConnection(connectionId: string, gameId: string) {
  // Store connectionId
  console.log(`connection from ${connectionId} for ${gameId}`);

  const newConnectionParams: PutCommandInput = {
    TableName,
    Item: {
      [PrimaryKey]: gameId,
      connectionId
    }
  };

  try {
    await dynamodb.send(new PutCommand(newConnectionParams));
  } catch (err: any) {
    console.error(`cannot add ${connectionId} to ${gameId}: ${err}`);
    throw err;
  }

  const connections = await queryGameConnections(gameId);

  // Let client know connectionId
  const joinedMsg: JoinedMessage = {
    event: 'JOINED',
    gameId,
    connectionId,
    allConnectionIds: connections
  };

  console.log(`sending JOINED message to ${connectionId}`);

  const postCommand = new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify(joinedMsg)
  });
  try {
    await apigClient.send(postCommand);
  } catch (error: any) {
    if (error.statusCode === 410) {
      deleteConnections(gameId, [connectionId]);
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

  console.log(`sending WELCOME message to ${connections.length} others`);
  await sendToAll(
    gameId,
    connections.filter((c) => c !== connectionId),
    JSON.stringify(welcomeMsg)
  );
}

async function queryGameConnections(gameId: string): Promise<string[]> {
  console.log(`getting other connections for ${gameId}`);
  const queryOtherConnectionsParams: QueryCommandInput = {
    TableName,
    KeyConditionExpression: `${PrimaryKey} = :id`,
    ExpressionAttributeValues: { ':id': gameId }
  };

  const connections: string[] = [];
  try {
    const data = await dynamodb.send(
      new QueryCommand(queryOtherConnectionsParams)
    );
    if (data && Array.isArray(data.Items)) {
      connections.push(...data.Items.map((x) => x.connectionId));
    }
  } catch (err: any) {
    console.error(`cannot get other connections from gameId ${gameId}: ${err}`);
    throw err;
  }

  return connections;
}

async function queryGameId(connectionId: string): Promise<string> {
  const queryGameIdParams: QueryCommandInput = {
    TableName,
    IndexName: 'ConnectionIndex', // use the GSI
    KeyConditionExpression: 'connectionId = :connectionId',
    ExpressionAttributeValues: { ':connectionId': connectionId }
  };

  let gameId = '';
  try {
    const { Items } = await dynamodb.send(new QueryCommand(queryGameIdParams));
    if (Array.isArray(Items) && Items.length) {
      gameId = Items[0].gameId;
    }
  } catch (err: any) {
    console.error(
      `cannot get gameId from connectionId ${connectionId}:  ${err}`
    );
    throw err;
  }

  if (!gameId) {
    throw new Error(`cannot get gameId from connectionId ${connectionId}`);
  }

  return gameId;
}

async function handleEndConnection(connectionId: string) {
  const gameId = await queryGameId(connectionId);
  const connections = await queryGameConnections(gameId);
  console.log(`removing ${connectionId} from ${gameId}`);
  deleteConnections(gameId, [connectionId], connections);
}

async function handleActionEvent(
  connectionId: string,
  action: AnnounceMessage
) {
  const gameId = await queryGameId(connectionId);
  const connections = await queryGameConnections(gameId);

  const msg: AnnounceMessage = { ...action, event: 'ACTION', connectionId };
  await sendToAll(gameId, connections, JSON.stringify(msg));
}

exports.handler = async function (event: SQSEvent) {
  for (const record of event.Records) {
    const payload = JSON.parse(record.body);

    if (payload.event === 'JOINED') {
      const joinedMsg = payload as JoinedMessage;
      return handleNewConnection(joinedMsg.connectionId, joinedMsg.gameId);
    }

    if (payload.event === 'LEFT') {
      const leftMsg = payload as LeftMessage;
      const [goneId] = leftMsg.connectionIds;
      return handleEndConnection(goneId);
    }

    if (payload.event === 'ACTION') {
      const announceMsg = payload as AnnounceMessage;
      await handleActionEvent(announceMsg.connectionId, announceMsg);
    }
  }

  return { statusCode: 200, body: 'Data processed' };
};
