import { defineBackend } from '@aws-amplify/backend';
import { Duration } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { submitSignedAck } from './functions/submit-signed-ack/resource';

const requiredEnv = (name: 'ACK_BUCKET_NAME' | 'ALLOWED_ORIGIN') => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const bucketName = requiredEnv('ACK_BUCKET_NAME');
const allowedOrigin = requiredEnv('ALLOWED_ORIGIN');

const backend = defineBackend({
  submitSignedAck
});

const apiStack = backend.createStack('submit-signed-ack-api');
const httpApi = new HttpApi(apiStack, 'SubmitSignedAckHttpApi', {
  apiName: 'submit-signed-ack-api',
  corsPreflight: {
    allowOrigins: [allowedOrigin],
    allowHeaders: ['content-type'],
    allowMethods: [CorsHttpMethod.OPTIONS, CorsHttpMethod.POST],
    maxAge: Duration.days(1)
  }
});

httpApi.addRoutes({
  path: '/submit-signed-ack',
  methods: [HttpMethod.POST],
  integration: new HttpLambdaIntegration(
    'SubmitSignedAckLambdaIntegration',
    backend.submitSignedAck.resources.lambda
  )
});

backend.submitSignedAck.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['s3:PutObject'],
    resources: [`arn:aws:s3:::${bucketName}/acks/*`]
  })
);

backend.addOutput({
  custom: {
    submitSignedAckApi: {
      name: httpApi.httpApiName,
      endpoint: httpApi.apiEndpoint,
      submitSignedAckUrl: `${httpApi.apiEndpoint}/submit-signed-ack`
    }
  }
});
