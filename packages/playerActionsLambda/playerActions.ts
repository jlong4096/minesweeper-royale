import { APIGatewayProxyWebsocketEventV2, Context } from 'aws-lambda';

import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput
} from '@aws-sdk/client-sqs';

import { JoinedMessage, LeftMessage, AnnounceMessage } from 'playerActions-lib';

const sqsClient = new SQSClient({
  region: process.env.REGION
});

const QueueUrl = process.env.QUEUE_URL || '';
if (!QueueUrl) {
  throw new Error('Cannot start without QUEUE_URL env var set');
}

exports.handler = async function (
  event: APIGatewayProxyWebsocketEventV2,
  context: Context
) {
  const connectionId = event.requestContext.connectionId;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const gameId = event.queryStringParameters?.gameId;

  const params: SendMessageCommandInput = {
    QueueUrl,
    MessageBody: ''
  };

  if (event.requestContext.eventType === 'CONNECT') {
    if (!gameId) {
      throw new Error('Connection event does not include a gameId');
    }
    const joinedMsg: JoinedMessage = {
      event: 'JOINED',
      gameId,
      connectionId: event.requestContext.connectionId,
      allConnectionIds: [] // to be filled in by sqs handler
    };
    params.MessageBody = JSON.stringify(joinedMsg);
  } else if (event.requestContext.eventType === 'DISCONNECT') {
    const leftMsg: LeftMessage = {
      event: 'LEFT',
      connectionIds: [event.requestContext.connectionId]
    };
    params.MessageBody = JSON.stringify(leftMsg);
  } else if (event.requestContext.eventType === 'MESSAGE') {
    const action = JSON.parse(event.body || '{}');
    console.log(
      `message ${event.body} received from ${connectionId} for ${action.gameId}`
    );

    if (action.event === 'ACTION') {
      const announceMsg: AnnounceMessage = {
        ...action,
        connectionId: event.requestContext.connectionId
      };
      params.MessageBody = JSON.stringify(announceMsg);
    }
  }

  if (!params.MessageBody) {
    throw new Error(`Cannot handle event ${event}`);
  }

  try {
    await sqsClient.send(new SendMessageCommand(params));
  } catch (err: any) {
    console.error(`Cannot send message to SQS: ${err}`);
    throw err;
  }

  return { statusCode: 200, body: 'Websocket processed' };
};
