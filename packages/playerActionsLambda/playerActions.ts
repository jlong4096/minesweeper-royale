import { APIGatewayProxyWebsocketEventV2, Context, SQSEvent } from "aws-lambda";

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const apigClient = new ApiGatewayManagementApiClient({
  region: process.env.REGION,
  endpoint: process.env.API_GW_ENDPOINT,
});

const dbClient = new DynamoDBClient({ region: process.env.REGION });
const dynamodb = DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.CONNECTIONS_TABLE_NAME;

// function isAPIGatewayEvent(
//   event: APIGatewayProxyWebsocketEventV2 | SQSEvent
// ): event is APIGatewayProxyWebsocketEventV2 {
//   return (
//     (event as APIGatewayProxyWebsocketEventV2).requestContext?.routeKey !==
//     undefined
//   );
// }

// TODO:   Game should "lock down" when all clients connect and has started.
// This means that we should be able to query for the available connections once
// for the life of the game or life of the lambda function.
// Until then, doing expensive look-ups with each message.

async function deleteConnection(connectionId: string) {
  console.log(`disconnection from ${connectionId}`);

  await dynamodb.send(
    new DeleteCommand({
      TableName,
      Key: { connectionId },
    })
  );
}

exports.handler = async function (
  event: APIGatewayProxyWebsocketEventV2,
  // event: APIGatewayProxyWebsocketEventV2 | SQSEvent,
  context: Context
) {
  const connectionId = event.requestContext.connectionId;
  // @ts-ignore
  const gameId = event.queryStringParameters?.gameId || "game-x";
  // if (isAPIGatewayEvent(event)) {
  if (event.requestContext.eventType === "CONNECT") {
    // Store connectionId
    console.log(`connection from ${connectionId} for ${gameId}`);
    await dynamodb.send(
      new PutCommand({
        TableName,
        Item: {
          connectionId: connectionId,
          gameId: gameId,
        },
      })
    );
  }

  if (event.requestContext.eventType === "DISCONNECT") {
    // Remove connectionId
    deleteConnection(connectionId);
  }

  if (event.requestContext.eventType === "MESSAGE") {
    const action = JSON.parse(event.body || "{}");
    console.log(
      // @ts-ignore
      `message ${event.body} received from ${connectionId} for ${action.gameId}`
    );

    const { Items: connections } = await dynamodb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "gameId = :g",
        ExpressionAttributeValues: {
          ":g": action.gameId,
        },
      })
    );

    if (!Array.isArray(connections) || !connections.length) {
      throw new Error(`cannot query connections for game ${action.gameId}`);
    }

    try {
      // Send a message to the clients
      console.log(`sending to ${connections.length}`);
      const promises = connections.map(({ connectionId }) => {
        const postCommand = new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: event.body || "some body",
        });
        return apigClient.send(postCommand);
      });

      await Promise.all(promises);
    } catch (err: any) {
      if (err.statusCode === 410) {
        // The connection is no longer available
        console.log(`connection ${connectionId} is no longer available`);
        deleteConnection(connectionId);
      } else {
        throw err;
      }
    }
  }

  // } else {
  //   if (event.Records) {
  //     // Process the SQS messages
  //     for (let record of event.Records) {
  //       const body = JSON.parse(record.body);
  //       console.log(body);
  //       // const message = body.message;
  //       // const connectionId = body.connectionId;
  //
  //       try {
  //         // Send a message to the client
  //         console.log(`sending to ${clientIds.length}`);
  //         const promises = clientIds.map((clientId) => {
  //           const postCommand = new PostToConnectionCommand({
  //             ConnectionId: clientId,
  //             Data: body,
  //           });
  //           return apigClient.send(postCommand);
  //         });
  //
  //         await Promise.all(promises);
  //       } catch (err: any) {
  //         if (err.statusCode === 410) {
  //           // The connection is no longer available
  //           // console.log(`connection ${connectionId} is no longer available`);
  //           // const idx = clientIds.findIndex(
  //           //   (x) => x === event.requestContext.connectionId
  //           // );
  //           // if (idx > -1) {
  //           //   clientIds.splice(idx, 1);
  //           // }
  //         } else {
  //           throw err;
  //         }
  //       }
  //     }
  //   }
  // }

  return { statusCode: 200, body: "Data processed" };
};
