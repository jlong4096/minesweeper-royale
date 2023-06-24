const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqsClient = new SQSClient({ region: process.env.REGION });

exports.handler = async function (event, context) {
  const params = {
    MessageBody: JSON.stringify(event.body),
    QueueUrl: process.env.QUEUE_URL, // Fetch the Queue URL from the environment variables
  };

  const command = new SendMessageCommand(params);

  try {
    await sqsClient.send(command);
    return { statusCode: 200, body: "Message sent" };
  } catch (err) {
    return { statusCode: 500, body: "Error: " + err };
  }
};
