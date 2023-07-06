import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigw_integ from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
// import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

const ALLOW_ORIGINS = [
  "http://localhost:5173",
  "https://www.minesweeper-royale.com",
];
const ALLOW_HEADERS = ["Content-Type"];

// Apparently CloudFront certificate must be in us-east-1
const GLOBAL_CERTIFICATE_ARN =
  "arn:aws:acm:us-east-1:439377653485:certificate/ef7b1aa9-c0b0-4c4b-8333-cc4a24be3bda";

// And API Gateway certificates must be in the same region as the API Gateway
const REGIONAL_CERTIFICATE_ARN =
  "arn:aws:acm:us-east-2:439377653485:certificate/51821d31-66b9-4cae-91cb-74de12fcd726";

export class AwsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //
    // Lookups
    //
    const zone = route53.HostedZone.fromLookup(
      this,
      "MinesweeperRoyaleHostedZone",
      {
        domainName: "minesweeper-royale.com",
      }
    );

    const globalCertificate = acm.Certificate.fromCertificateArn(
      this,
      "MinesweeperRoyaleGlobalCertificate",
      GLOBAL_CERTIFICATE_ARN
    );

    const regionalCertificate = acm.Certificate.fromCertificateArn(
      this,
      "MinesweeperRoyaleRegionalCertificate",
      REGIONAL_CERTIFICATE_ARN
    );

    //
    // Setup database
    //
    const gameTable = new dynamodb.Table(this, "GameTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "GameTable",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // The code that defines your stack goes here
    // const queue = new sqs.Queue(this, "PlayerActionsQueue");

    //
    // Setup frontend
    //
    const staticBucket = new s3.Bucket(this, "MinesweeperRoyaleStaticBucket", {
      websiteIndexDocument: "index.html",
      // publicReadAccess: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const OAI = new cloudfront.OriginAccessIdentity(this, "OAI", {
      comment: "OAI for MinesweeperRoyaleStaticBucket",
    });
    staticBucket.grantRead(OAI);

    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "StaticDistribution",
      {
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
          globalCertificate,
          {
            aliases: ["www.minesweeper-royale.com"],
            securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016,
            sslMethod: cloudfront.SSLMethod.SNI,
          }
        ),
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: staticBucket,
              originAccessIdentity: OAI,
            },
            behaviors: [{ isDefaultBehavior: true }],
          },
        ],
      }
    );

    const staticDeploy = new s3deploy.BucketDeployment(
      this,
      "DeployStaticAssets",
      {
        sources: [s3deploy.Source.asset("../minesweeper-ui/dist")],
        destinationBucket: staticBucket,
        distribution,
        distributionPaths: ["/*"],
      }
    );

    new route53.ARecord(this, "MinesweeperRoyaleCloudFrontAliasRecord", {
      zone: zone,
      recordName: "www",
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });

    //
    // Setup gameManagerLambda (HTTP/REST)
    //
    const gameManagerLambda = new lambda.Function(this, "GameManagerFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("../gameManagerLambda"),
      handler: "compiled/lambda.handler",
      environment: {
        REGION: this.region,
        // QUEUE_URL: queue.queueUrl,
        GAME_TABLE_NAME: gameTable.tableName,
        PRIMARY_KEY: "id",
        ALLOW_ORIGIN: "*",
        ALLOW_HEADERS: ALLOW_HEADERS.join(","),
      },
    });

    gameTable.grantReadWriteData(gameManagerLambda);
    // queue.grantSendMessages(gameManagerLambda);

    const httpDomain = new apigw.DomainName(
      this,
      "MinesweeperRoyaleApiDomainName",
      {
        domainName: "api.minesweeper-royale.com",
        certificate: regionalCertificate,
      }
    );

    const httpApi = new apigw.HttpApi(this, "MinesweeperRoyaleHttpApi", {
      defaultIntegration: new apigw_integ.HttpLambdaIntegration(
        "DefaultIntegration",
        gameManagerLambda
      ),
      corsPreflight: {
        allowOrigins: ALLOW_ORIGINS,
        allowMethods: [apigw.CorsHttpMethod.ANY], // allow any method
        allowHeaders: ALLOW_HEADERS,
      },
      defaultDomainMapping: {
        domainName: httpDomain,
        mappingKey: "MinesweeperRoyaleHttpApiDomainName",
      },
    });

    new route53.ARecord(this, "MinesweeperRoyaleApiGatewayAliasRecord", {
      zone: zone,
      recordName: "api",
      target: route53.RecordTarget.fromAlias(
        new route53targets.ApiGatewayv2DomainProperties(
          httpDomain.regionalDomainName,
          httpDomain.regionalHostedZoneId
        )
      ),
    });

    new cdk.CfnOutput(this, "ApiGatewayURL", {
      value: httpApi.apiEndpoint,
    });

    //
    // Setup playerActionsLambda (Websocket)
    //
    const wsDomain = new apigw.DomainName(
      this,
      "MinesweeperRoyaleWsDomainName",
      {
        domainName: "ws.minesweeper-royale.com",
        certificate: regionalCertificate,
      }
    );

    const webSocketApi = new apigw.WebSocketApi(this, "PlayerActionsWebSocket");
    const webSocketStage = new apigw.WebSocketStage(
      this,
      "MinesweeperRoyaleWsStage",
      {
        webSocketApi,
        stageName: "poc",
        autoDeploy: true,
        domainMapping: {
          domainName: wsDomain,
          mappingKey: "MinesweeperRoyaleWsApiDomainName",
        },
      }
    );

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

    new route53.ARecord(this, "MinesweeperRoyaleWsGatewayAliasRecord", {
      zone: zone,
      recordName: "ws",
      target: route53.RecordTarget.fromAlias(
        new route53targets.ApiGatewayv2DomainProperties(
          wsDomain.regionalDomainName,
          wsDomain.regionalHostedZoneId
        )
      ),
    });

    new cdk.CfnOutput(this, "WebsocketURL", {
      value: webSocketApi.apiEndpoint,
    });

    // new cdk.CfnOutput(this, "DistributionDomainName", {
    //   value: distribution.distributionDomainName,
    // });
  }
}
