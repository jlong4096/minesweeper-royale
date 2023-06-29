"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const apigClient = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({
    region: process.env.REGION,
    endpoint: process.env.API_GW_ENDPOINT,
});
const dbClient = new client_dynamodb_1.DynamoDBClient({ region: process.env.REGION });
const dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(dbClient);
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
function deleteConnection(connectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`disconnection from ${connectionId}`);
        yield dynamodb.send(new lib_dynamodb_1.DeleteCommand({
            TableName,
            Key: { connectionId },
        }));
    });
}
exports.handler = function (event, 
// event: APIGatewayProxyWebsocketEventV2 | SQSEvent,
context) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const connectionId = event.requestContext.connectionId;
        // @ts-ignore
        const gameId = ((_a = event.queryStringParameters) === null || _a === void 0 ? void 0 : _a.gameId) || "game-x";
        // if (isAPIGatewayEvent(event)) {
        if (event.requestContext.eventType === "CONNECT") {
            // Store connectionId
            console.log(`connection from ${connectionId} for ${gameId}`);
            yield dynamodb.send(new lib_dynamodb_1.PutCommand({
                TableName,
                Item: {
                    connectionId: connectionId,
                    gameId: gameId,
                },
            }));
        }
        if (event.requestContext.eventType === "DISCONNECT") {
            // Remove connectionId
            deleteConnection(connectionId);
        }
        if (event.requestContext.eventType === "MESSAGE") {
            const action = JSON.parse(event.body || "{}");
            console.log(
            // @ts-ignore
            `message ${event.body} received from ${connectionId} for ${action.gameId}`);
            const { Items: connections } = yield dynamodb.send(new lib_dynamodb_1.QueryCommand({
                TableName,
                KeyConditionExpression: "gameId = :g",
                ExpressionAttributeValues: {
                    ":g": action.gameId,
                },
            }));
            if (!Array.isArray(connections) || !connections.length) {
                throw new Error(`cannot query connections for game ${action.gameId}`);
            }
            try {
                // Send a message to the clients
                console.log(`sending to ${connections.length}`);
                const promises = connections.map(({ connectionId }) => {
                    const postCommand = new client_apigatewaymanagementapi_1.PostToConnectionCommand({
                        ConnectionId: connectionId,
                        Data: event.body || "some body",
                    });
                    return apigClient.send(postCommand);
                });
                yield Promise.all(promises);
            }
            catch (err) {
                if (err.statusCode === 410) {
                    // The connection is no longer available
                    console.log(`connection ${connectionId} is no longer available`);
                    deleteConnection(connectionId);
                }
                else {
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
    });
};
