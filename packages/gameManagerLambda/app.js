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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const fastify_1 = __importDefault(require("fastify"));
const app = (0, fastify_1.default)({ logger: true });
const dbClient = new client_dynamodb_1.DynamoDBClient({ region: process.env.REGION });
const dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(dbClient);
const TableName = process.env.GAME_TABLE_NAME;
// List all games
app.get("/games", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield dynamodb.send(new client_dynamodb_1.ScanCommand({ TableName }));
    return result.Items;
}));
// Create a new game
app.post("/games", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const game = Object.assign(Object.assign({}, request.body), { id: (0, uuid_1.v4)() });
    yield dynamodb.send(new lib_dynamodb_1.PutCommand({ TableName, Item: game }));
    return game;
}));
// Delete a game
app.delete("/games/:id", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const id = request.params.id;
    yield dynamodb.send(new lib_dynamodb_1.DeleteCommand({ TableName, Key: { id } }));
    return { message: `Game with ID ${id} deleted` };
}));
exports.default = app;
