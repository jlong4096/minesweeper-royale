import cors from '@fastify/cors';
import { v4 as uuid } from 'uuid';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  GetCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import fastify, { FastifyInstance } from 'fastify';
import {
  MineCoordinate,
  generateMineLocations
} from 'generateMineLocations-lib';

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '';
const ALLOW_HEADERS = process.env.ALLOW_HEADERS;
const GRID_WIDTH = 16;
const GRID_HEIGHT = 30;
const NUM_MINES = 99;

const dbClient = new DynamoDBClient({ region: process.env.REGION });
const dynamodb = DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.GAME_TABLE_NAME;
const PrimaryKey = process.env.PRIMARY_KEY || 'id';

const app: FastifyInstance = fastify({ logger: true });

(async () =>
  await app.register(cors, {
    origin: ALLOW_ORIGIN,
    allowedHeaders: ALLOW_HEADERS
  }))();

interface Game {
  id: string;
  name: string;
  coordinates: MineCoordinate[];
}

// Create a new game
app.post<{ Body: Game }>('/games', async (request, reply) => {
  const game: Game = {
    ...request.body,
    id: uuid(),
    coordinates: generateMineLocations(GRID_WIDTH, GRID_HEIGHT, NUM_MINES)
  };
  await dynamodb.send(new PutCommand({ TableName, Item: game }));
  return { id: game.id, name: game.name };
});

// Get game
app.get<{ Params: { id: string } }>('/games/:id', async (request, reply) => {
  const id = request.params.id;
  const game = await dynamodb.send(
    new GetCommand({
      TableName,
      Key: { [PrimaryKey]: id },
      ProjectionExpression: 'id,#n,coordinates',
      ExpressionAttributeNames: { '#n': 'name' }
    })
  );
  return game.Item;
});

// List all games
app.get('/games', async (request, reply) => {
  const result = await dynamodb.send(
    new ScanCommand({
      TableName,
      ProjectionExpression: 'id,#n',
      ExpressionAttributeNames: { '#n': 'name' }
    })
  );
  console.log('games', result.Items);
  return result.Items;
});

// Delete a game
app.delete<{ Params: { id: string } }>('/games/:id', async (request, reply) => {
  const id = request.params.id;
  await dynamodb.send(new DeleteCommand({ TableName, Key: { id } }));
  return { message: `Game with ID ${id} delete` };
});

export default app;
