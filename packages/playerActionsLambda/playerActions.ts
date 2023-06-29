import { APIGatewayProxyWebsocketEventV2, Context } from "aws-lambda";

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";

const apigClient = new ApiGatewayManagementApiClient({
  region: process.env.REGION,
  endpoint: process.env.API_GW_ENDPOINT,
});

const dbClient = new DynamoDBClient({ region: process.env.REGION });
const dynamodb = DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.GAME_TABLE_NAME;
const PrimaryKey = process.env.PRIMARY_KEY || "id";

async function deleteConnections(gameId: string, connectionIds: string[]) {
  console.log(`disconnection from ${connectionIds.join(", ")}`);

  const params: UpdateCommandInput = {
    TableName,
    Key: { [PrimaryKey]: gameId },
    UpdateExpression: "DELETE #con :removeConnection",
    ExpressionAttributeNames: { "#con": "connections" },
    ExpressionAttributeValues: { ":removeConnection": new Set(connectionIds) },
  };

  await dynamodb.send(new UpdateCommand(params));
}

exports.handler = async function (
  event: APIGatewayProxyWebsocketEventV2,
  context: Context
) {
  const connectionId = event.requestContext.connectionId;
  if (event.requestContext.eventType === "CONNECT") {
    // @ts-ignore
    const gameId = event.queryStringParameters?.gameId || "game-x";
    // Store connectionId
    console.log(`connection from ${connectionId} for ${gameId}`);

    const params: UpdateCommandInput = {
      TableName,
      Key: {
        [PrimaryKey]: gameId,
      },
      UpdateExpression: "ADD #con :newConnection",
      ExpressionAttributeNames: { "#con": "connections" },
      ExpressionAttributeValues: {
        ":newConnection": new Set([connectionId]),
      },
    };

    await dynamodb.send(new UpdateCommand(params));
  }

  if (event.requestContext.eventType === "MESSAGE") {
    const action = JSON.parse(event.body || "{}");
    const gameId = action.gameId;
    console.log(
      // @ts-ignore
      `message ${event.body} received from ${connectionId} for ${gameId}`
    );

    // TODO:   Game should "lock down" when all clients connect and has started.
    // This means that we should be able to query for the available connections once
    // for the life of the game or life of the lambda function.
    // Until then, doing expensive look-ups with each message.

    const params: GetCommandInput = {
      TableName,
      Key: { [PrimaryKey]: gameId },
      ProjectionExpression: "connections",
    };

    const connections: string[] = [];
    try {
      const { Item } = await dynamodb.send(new GetCommand(params));
      if (Item) {
        connections.push(...Item.connections);
      }
    } catch (err: any) {
      console.error(`cannot get connections from gameId ${gameId}:  ${err}`);
      throw err;
    }

    // Send a message to the clients
    console.log(`sending to ${connections.length}`);

    // Array to hold any 410 errors.
    const goneConnections: string[] = [];

    const promises = connections.map(async (connectionId) => {
      const postCommand = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: event.body || "",
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

  return { statusCode: 200, body: "Data processed" };
};
