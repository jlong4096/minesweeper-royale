const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require("@aws-sdk/client-apigatewaymanagementapi");

const apigClient = new ApiGatewayManagementApiClient({
  region: process.env.REGION,
  endpoint: process.env.API_GW_ENDPOINT,
});

const clientIds = [];

exports.handler = async function (event, context) {
  if (event.requestContext?.eventType === "CONNECT") {
    // Store connectionId
    console.log(`connection from ${event.requestContext.connectionId}`);
    clientIds.push(event.requestContext.connectionId);
  }

  if (event.requestContext?.eventType === "DISCONNECT") {
    // Remove connectionId
    console.log(`disconnection from ${event.requestContext.connectionId}`);

    const idx = clientIds.findIndex(
      (x) => x === event.requestContext.connectionId
    );
    if (idx > -1) {
      clientIds.splice(idx, 1);
    }
  }

  if (event.Records) {
    // Process the SQS messages
    for (let record of event.Records) {
      const body = JSON.parse(record.body);
      console.log(body);
      // const message = body.message;
      // const connectionId = body.connectionId;

      try {
        // Send a message to the client
        console.log(`sending to ${clientIds.length}`);
        const promises = clientIds.map((clientId) => {
          const postCommand = new PostToConnectionCommand({
            ConnectionId: clientId,
            Data: body,
          });
          return apigClient.send(postCommand);
        });

        await Promise.all(promises);
      } catch (err) {
        if (err.statusCode === 410) {
          // The connection is no longer available
          // console.log(`connection ${connectionId} is no longer available`);
          // const idx = clientIds.findIndex(
          //   (x) => x === event.requestContext.connectionId
          // );
          // if (idx > -1) {
          //   clientIds.splice(idx, 1);
          // }
        } else {
          throw err;
        }
      }
    }
  }

  return { statusCode: 200, body: "Data processed" };
};
