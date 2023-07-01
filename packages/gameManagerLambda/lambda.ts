import awsLambdaFastify from '@fastify/aws-lambda';
import app from './app';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

const proxy = awsLambdaFastify(app);

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  return proxy(event, context);
};

(async () => await app.ready())();
