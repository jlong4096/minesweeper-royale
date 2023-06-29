import { v4 as uuid } from "uuid";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import fastify, { FastifyInstance } from "fastify";

const app: FastifyInstance = fastify({ logger: true });

interface Game {
  id: string;
  name: string;
}

const dbClient = new DynamoDBClient({ region: process.env.REGION });
const dynamodb = DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.GAME_TABLE_NAME;

// List all games
app.get("/games", async (request, reply) => {
  const result = await dynamodb.send(new ScanCommand({ TableName }));
  return result.Items;
});

// Create a new game
app.post<{ Body: Game }>("/games", async (request, reply) => {
  const game: Game = { ...request.body, id: uuid() };
  await dynamodb.send(new PutCommand({ TableName, Item: game }));
  return game;
});

// Delete a game
app.delete<{ Params: { id: string } }>("/games/:id", async (request, reply) => {
  const id = request.params.id;
  await dynamodb.send(new DeleteCommand({ TableName, Key: { id } }));
  return { message: `Game with ID ${id} deleted` };
});

export default app;
