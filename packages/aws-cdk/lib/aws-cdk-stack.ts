import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigw_integ from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

const ALLOW_ORIGIN = "http://localhost:5173";
const ALLOW_HEADERS = ["Content-Type"];

export class AwsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gameTable = new dynamodb.Table(this, "GameTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "GameTable",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // The code that defines your stack goes here
    // const queue = new sqs.Queue(this, "PlayerActionsQueue");

    const gameManagerLambda = new lambda.Function(this, "GameManagerFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("../gameManagerLambda"),
      handler: "compiled/lambda.handler",
      environment: {
        REGION: this.region,
        // QUEUE_URL: queue.queueUrl,
        GAME_TABLE_NAME: gameTable.tableName,
        PRIMARY_KEY: "id",
        ALLOW_ORIGIN,
        ALLOW_HEADERS: ALLOW_HEADERS.join(","),
      },
    });

    gameTable.grantReadWriteData(gameManagerLambda);
    // queue.grantSendMessages(gameManagerLambda);

    const webSocketApi = new apigw.WebSocketApi(this, "PlayerActionsWebSocket");
    const webSocketStage = new apigw.WebSocketStage(this, "POCStage", {
      webSocketApi,
      stageName: "poc",
      autoDeploy: true,
    });

    const playerActionsLambda = new lambda.Function(
      this,
      "PlayerActionsFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset("../playerActionsLambda"),
        handler: "compiled/playerActions.handler",
        reservedConcurrentExecutions: 1,
        environment: {
          REGION: this.region,
          API_GW_ENDPOINT: `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`,
          // CONNECTIONS_TABLE_NAME: connectionsTable.tableName,
          GAME_TABLE_NAME: gameTable.tableName,
          PRIMARY_KEY: "id",
        },
      }
    );

    gameTable.grantReadWriteData(playerActionsLambda);
    // connectionsTable.grantReadWriteData(playerActionsLambda);
    // queue.grantSendMessages(playerActionsLambda);
    webSocketApi.grantManageConnections(playerActionsLambda);
    // playerActionsLambda.addEventSource(new SqsEventSource(queue));

    // webSocketApi.addRoute("$connect", {
    //   integration: new apigw_integ.WebSocketLambdaIntegration(
    //     "ConnectIntegration",
    //     playerActionsLambda
    //   ),
    // });

    // webSocketApi.addRoute("$disconnect", {
    //   integration: new apigw_integ.WebSocketLambdaIntegration(
    //     "DisconnectIntegration",
    //     playerActionsLambda
    //   ),
    // });
    //
    webSocketApi.addRoute("$default", {
      integration: new apigw_integ.WebSocketLambdaIntegration(
        "DefaultItegration",
        playerActionsLambda
      ),
    });

    const httpApi = new apigw.HttpApi(this, "POCHttpApi", {
      defaultIntegration: new apigw_integ.HttpLambdaIntegration(
        "DefaultIntegration",
        gameManagerLambda
      ),
      corsPreflight: {
        allowOrigins: [ALLOW_ORIGIN],
        allowMethods: [apigw.CorsHttpMethod.ANY], // allow any method
        allowHeaders: ALLOW_HEADERS,
      },
    });

    new cdk.CfnOutput(this, "WebsocketURL", {
      value: webSocketApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, "ApiGatewayURL", {
      value: httpApi.apiEndpoint,
    });
  }
}
