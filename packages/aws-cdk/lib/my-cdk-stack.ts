import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigw_integ from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class MyPOCCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const queue = new sqs.Queue(this, "POCQueue");

    const senderLambda = new lambda.Function(this, "SenderFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("../senderLambda"),
      handler: "sender.handler",
      environment: {
        REGION: this.region,
        QUEUE_URL: queue.queueUrl,
      },
    });

    queue.grantSendMessages(senderLambda);

    const webSocketApi = new apigw.WebSocketApi(this, "POCWebSocket");
    const webSocketStage = new apigw.WebSocketStage(this, "POCStage", {
      webSocketApi,
      stageName: "poc",
      autoDeploy: true,
    });

    const receiverLambda = new lambda.Function(this, "ReceiverFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("../receiverLambda"),
      handler: "receiver.handler",
      reservedConcurrentExecutions: 1,
      environment: {
        REGION: this.region,
        API_GW_ENDPOINT: `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`,
      },
    });

    webSocketApi.grantManageConnections(receiverLambda);
    receiverLambda.addEventSource(new SqsEventSource(queue));

    webSocketApi.addRoute("$connect", {
      integration: new apigw_integ.WebSocketLambdaIntegration(
        "ConnectIntegration",
        receiverLambda
      ),
    });

    webSocketApi.addRoute("$disconnect", {
      integration: new apigw_integ.WebSocketLambdaIntegration(
        "DisconnectIntegration",
        receiverLambda
      ),
    });

    webSocketApi.addRoute("$default", {
      integration: new apigw_integ.WebSocketLambdaIntegration(
        "DefaultItegration",
        receiverLambda
      ),
    });

    // const webSocketApi = new apigw.WebSocketApi(this, "POCWebSocket", {
    //   connectRouteOptions: {
    //     integration: new apigw_integ.WebSocketLambdaIntegration(
    //       "ConnectIntegration",
    //       receiverLambda
    //     ),
    //   },
    //   disconnectRouteOptions: {
    //     integration: new apigw_integ.WebSocketLambdaIntegration(
    //       "DisconnectIntegration",
    //       receiverLambda
    //     ),
    //   },
    //   defaultRouteOptions: {
    //     integration: new apigw_integ.WebSocketLambdaIntegration(
    //       "DefaultItegration",
    //       receiverLambda
    //     ),
    //   },
    // });
    //

    const httpApi = new apigw.HttpApi(this, "POCHttpApi", {
      defaultIntegration: new apigw_integ.HttpLambdaIntegration(
        "DefaultIntegration",
        senderLambda
      ),
      corsPreflight: {
        allowOrigins: ["http://localhost:8000"],
        allowMethods: [apigw.CorsHttpMethod.ANY], // allow any method
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
