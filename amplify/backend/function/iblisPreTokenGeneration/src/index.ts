import { Callback, CognitoUserPoolTriggerEvent, CognitoUserPoolTriggerHandler, Context } from 'aws-lambda';
// eslint-disable-next-line import/no-duplicates
import * as AWSSigners from 'aws-sdk';
// eslint-disable-next-line import/no-duplicates
import * as AWSUtils from 'aws-sdk';
// eslint-disable-next-line import/no-duplicates
import { config, Endpoint, HttpRequest } from 'aws-sdk';
import https from 'https';
import { URL } from 'url';

const { REGION } = process.env;
if (!REGION) {
  throw new Error("Function requires environment variable: 'REGION'");
}

const APP_SYNC_URL = process.env.API_IBLIS_GRAPHQLAPIENDPOINTOUTPUT;
if (!APP_SYNC_URL) {
  throw new Error("Function requires environment variable: 'API_IBLIS_GRAPHQLAPIENDPOINTOUTPUT'");
}
const ENDPOINT_HOSTNAME = new URL(APP_SYNC_URL).hostname;

type getUserPreferenceQueryResponse = {
  data: {
    getUserPreference?: {
      currentWorkspaceId?: string;
    };
  };
};

const getUserPreferenceQuery = `query GetUserPreference($user: String!) {
  getUserPreference($user) {
      currentWorkspaceId
  }
}`;

const getUserPreference = async (userId: string): Promise<getUserPreferenceQueryResponse> => {
  const req = new HttpRequest(new Endpoint(APP_SYNC_URL), REGION);
  req.method = 'POST';
  req.headers.host = ENDPOINT_HOSTNAME;
  req.headers['Content-Type'] = 'application/json';
  req.body = JSON.stringify({
    query: getUserPreferenceQuery,
    operationName: 'GetUserPreference',
    variables: { user: userId },
  });

  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore AWS.util is not a public API
  const signer = new AWSSigners.Signers.V4(req, 'appsync', true);
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore AWS.util is not a public API
  signer.addAuthorization(config.credentials, AWSUtils.util.date.getDate());

  const response = await new Promise((resolve) => {
    const httpRequest = https.request({ ...req, host: ENDPOINT_HOSTNAME }, (result) => {
      result.on('data', (data) => resolve(JSON.parse(data.toString())));
    });
    httpRequest.write(req.body);
    httpRequest.end();
  });
  return response as getUserPreferenceQueryResponse;
};

// eslint-disable-next-line import/prefer-default-export
export const handler: CognitoUserPoolTriggerHandler = async (event: CognitoUserPoolTriggerEvent, _context: Context, callback: Callback<CognitoUserPoolTriggerEvent>) => {
  const userId = event.userName;
  if (!userId) {
    throw new Error("Function requires to receive in event the username: 'event.userName'");
  }

  let claimsToAddOrOverride = {};

  const getUserPreferenceResponse = await getUserPreference(userId);
  if (getUserPreferenceResponse.data && getUserPreferenceResponse.data.getUserPreference && getUserPreferenceResponse.data.getUserPreference.currentWorkspaceId) {
    const { currentWorkspaceId } = getUserPreferenceResponse.data.getUserPreference;

    claimsToAddOrOverride = {
      ...claimsToAddOrOverride,
      currentWorkspaceId,
    };
  }

  // add the claims to override
  // eslint-disable-next-line no-param-reassign
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride,
    },
  };
  callback(null, event);
};
