import { join } from 'path';
import _ from 'lodash';
import * as fs from 'fs-extra';
import { parse, ObjectTypeDefinitionNode, Kind, visit, FieldDefinitionNode, StringValueNode } from 'graphql';
import axios from 'axios';
import {
  getProjectMeta,
  RDSTestDataProvider,
  createRDSInstance,
  addRDSPortInboundRule,
  getAppSyncApi,
} from 'amplify-category-api-e2e-core';
import { getBaseType, isArrayOrObject, toPascalCase } from 'graphql-transformer-common';
import { GQLQueryHelper } from '../query-utils/gql-helper';
import { getConfiguredAppsyncClientCognitoAuth, getConfiguredAppsyncClientOIDCAuth } from '../schema-api-directives';
import path from 'path';

export const verifyAmplifyMeta = (projectRoot: string, apiName: string, database: string) => {
  // Database info is updated in meta file
  const meta = getProjectMeta(projectRoot);
  const apiMeta = _.get(meta, ['api', apiName]);
  expect(apiMeta).toBeDefined();
  expect(_.get(apiMeta, 'output', 'GraphQLAPIIdOutput')).toBeDefined();
  expect(_.get(apiMeta, 'output', 'GraphQLAPIEndpointOutput')).toBeDefined();
  expect(_.get(apiMeta, 'output', 'GraphQLAPIKeyOutput')).toBeDefined();
};

export const verifyCompiledSchema = (projectRoot: string, apiName: string, expected: string = '') => {
  const compiledSchemaPath = join(projectRoot, 'amplify', 'backend', 'api', apiName, 'build', 'schema.graphql');
  expect(fs.existsSync(compiledSchemaPath)).toEqual(true);

  const schema = fs.readFileSync(compiledSchemaPath, { encoding: 'utf-8' });
  const parsedSchema = parse(schema);
  expect(parsedSchema?.definitions).toBeDefined();
  expect(schema).toContain('type Employee');
  expect(schema).toContain('type Person');
  expect(schema).toContain('type Contacts');
  if (!_.isEmpty(expected)) {
    expect(schema.trim()).toEqual(expected.trim());
  }
};

export type TestDBSetupInfo = {
  database: string;
  host: string;
  port: number;
  username: string;
  password: string;
  publicIpCidr: string;
  region: string;
  identifier: string;
};

export const setupRDSDatabase = async (
  dbInfo: Pick<TestDBSetupInfo, 'username' | 'password' | 'database' | 'identifier' | 'region'>,
): Promise<{ dbAdapter: RDSTestDataProvider; dbInfo: TestDBSetupInfo }> => {
  // Get the public IP of the machine running the test
  const url = 'http://api.ipify.org/';
  const response = await axios(url);
  const publicIpCidr = `${response.data.trim()}/32`;

  const username = dbInfo.username;
  const password = dbInfo.password;
  const db = await createRDSInstance({
    identifier: dbInfo.identifier,
    engine: 'mysql',
    dbname: dbInfo.database,
    username,
    password,
    region: dbInfo.region,
  });

  await addRDSPortInboundRule({
    region: dbInfo.region,
    port: db.port,
    cidrIp: publicIpCidr,
  });

  const dbAdapter = new RDSTestDataProvider({
    host: db.endpoint,
    port: db.port,
    username,
    password,
    database: dbInfo.database,
  });
  return {
    dbAdapter: dbAdapter,
    dbInfo: {
      host: db.endpoint,
      port: db.port,
      username,
      password,
      database: dbInfo.database,
      region: dbInfo.region,
      publicIpCidr: publicIpCidr,
      identifier: dbInfo.identifier,
    },
  };
};

export const verifyRDSSchema = (projectRoot: string, apiName: string, expected: string = '') => {
  const rdsSchemaPath = join(projectRoot, 'amplify', 'backend', 'api', apiName, 'schema.rds.graphql');
  const expectExists = !_.isEmpty(expected);
  expect(fs.existsSync(rdsSchemaPath)).toEqual(expectExists);
  if (!expectExists) {
    return;
  }
  const schema = fs.readFileSync(rdsSchemaPath, { encoding: 'utf-8' });
  expect(schema.trim()).toEqual(expected.trim());
};

export const generateDDL = (schema: string): string[] => {
  const document = parse(schema);
  const sqlStatements = [];
  const schemaVisitor = {
    ObjectTypeDefinition: {
      leave: (node: ObjectTypeDefinitionNode, key, parent, path, ancestors) => {
        if (!node?.directives?.some((d) => d?.name?.value === 'model')) {
          return;
        }
        const tableName = getMappedName(node);
        const fieldStatements = [];
        node.fields.forEach((field, index) => {
          fieldStatements.push(getFieldStatement(field, index === 0));
        });
        const sql = `CREATE TABLE ${tableName} (${fieldStatements.join(', ')});`;
        sqlStatements.push(sql);
      },
    },
  };
  visit(document, schemaVisitor);
  return sqlStatements;
};

const getMappedName = (definition: ObjectTypeDefinitionNode | FieldDefinitionNode): string => {
  const name = definition?.name?.value;
  const refersToDirective = definition?.directives?.find((d) => d?.name?.value === 'refersTo');
  if (!refersToDirective) {
    return name;
  }
  const mappedName = (refersToDirective?.arguments?.find((a) => a?.name?.value === 'name')?.value as StringValueNode)?.value;
  if (!mappedName) {
    return name;
  }
  return mappedName;
};

const getFieldStatement = (field: FieldDefinitionNode, isPrimaryKey: boolean) => {
  const fieldName = getMappedName(field);
  const fieldType = field.type;
  const isNonNull = fieldType.kind === Kind.NON_NULL_TYPE;
  const baseType = getBaseType(fieldType);
  const columnType = isArrayOrObject(fieldType, []) ? 'JSON' : convertToSQLType(baseType);
  const sql = `${fieldName} ${columnType} ${isNonNull ? 'NOT NULL' : ''} ${isPrimaryKey ? 'PRIMARY KEY' : ''}`;
  return sql;
};

const convertToSQLType = (type: string): string => {
  switch (type) {
    case 'ID':
    case 'String':
      return 'VARCHAR(255)';
    case 'Int':
      return 'INT';
    case 'Float':
      return 'FLOAT';
    case 'Boolean':
      return 'BOOLEAN';
    case 'AWSDateTime':
      return 'DATETIME';
    default:
      return 'VARCHAR(255)';
  }
};

export const createModelOperationHelpers = (appSyncClient: any, schema: string) => {
  const document = parse(schema);
  const modelOperationHelpers: { [key: string]: GQLQueryHelper } = {};
  const schemaVisitor = {
    ObjectTypeDefinition: {
      leave: (node: ObjectTypeDefinitionNode, key, parent, path, ancestors) => {
        const modelName = node.name.value;
        const selectionSetFields = node.fields.map((f) => f.name.value);
        const selectionSet = /* GraphQL */ `
          ${selectionSetFields.join('\n')}
        `;
        const primaryKeyField = selectionSetFields[0];
        const getSelectionSet = /* GraphQL */ `
          query Get${modelName}($${primaryKeyField}: ID!) {
            get${modelName}(${primaryKeyField}: $${primaryKeyField}) {
              ${selectionSetFields.join('\n')}
            }
          }
        `;
        const listSelectionSet = /* GraphQL */ `
          query List${modelName}s {
            list${modelName}s {
              items {
                ${selectionSetFields.join('\n')}
              }
            }
          }
        `;
        const subscriptionSelectionSet = (operation: string): string => {
          return /* GraphQL */ `
            subscription On${toPascalCase([operation])}${modelName} {
              on${toPascalCase([operation])}${modelName} {
                ${selectionSetFields.join('\n')}
              }
            }
          `;
        };
        const helper = new GQLQueryHelper(appSyncClient, modelName, {
          mutation: {
            create: selectionSet,
            update: selectionSet,
            delete: selectionSet,
          },
          query: {
            get: getSelectionSet,
            list: listSelectionSet,
          },
          subscription: {
            onCreate: subscriptionSelectionSet('create'),
            onUpdate: subscriptionSelectionSet('update'),
            onDelete: subscriptionSelectionSet('delete'),
          },
        });

        modelOperationHelpers[modelName] = helper;
      },
    },
  };
  visit(document, schemaVisitor);
  return modelOperationHelpers;
};

export type AuthProvider = 'apiKey' | 'iam' | 'oidc' | 'userPools' | 'function';

export const configureAppSyncClients = async (
  projRoot: string,
  apiName: string,
  authProviders: [AuthProvider],
  userMap?: { [key: string]: any },
): Promise<any> => {
  const meta = getProjectMeta(projRoot);
  const appRegion = meta.providers.awscloudformation.Region;
  const { output } = meta.api[apiName];
  const { GraphQLAPIIdOutput, GraphQLAPIEndpointOutput } = output;
  const { graphqlApi } = await getAppSyncApi(GraphQLAPIIdOutput, appRegion);

  expect(GraphQLAPIIdOutput).toBeDefined();
  expect(GraphQLAPIEndpointOutput).toBeDefined();

  expect(graphqlApi).toBeDefined();
  expect(graphqlApi.apiId).toEqual(GraphQLAPIIdOutput);

  const apiEndPoint = GraphQLAPIEndpointOutput as string;

  const appSyncClients: { [key: string]: any } = {};

  if (authProviders?.includes('userPools') && userMap) {
    appSyncClients['userPools'] = {};
    Object.keys(userMap)?.map((userName: string) => {
      const userAppSyncClient = getConfiguredAppsyncClientCognitoAuth(apiEndPoint, appRegion, userMap[userName]);
      appSyncClients['userPools'][userName] = userAppSyncClient;
    });
  }

  if (authProviders?.includes('oidc') && userMap) {
    appSyncClients['oidc'] = {};
    Object.keys(userMap)?.map((userName: string) => {
      const userAppSyncClient = getConfiguredAppsyncClientOIDCAuth(apiEndPoint, appRegion, userMap[userName]);
      appSyncClients['oidc'][userName] = userAppSyncClient;
    });
  }
  return appSyncClients;
};

export const getAppSyncEndpoint = (projRoot: string, apiName: string): string => {
  const meta = getProjectMeta(projRoot);
  const { output } = meta.api[apiName];
  const { GraphQLAPIEndpointOutput } = output;
  expect(GraphQLAPIEndpointOutput).toBeDefined();
  return GraphQLAPIEndpointOutput as string;
};

export const checkOperationResult = (result: any, expected: any, resultSetName: string, isList: boolean = false): void => {
  expect(result).toBeDefined();
  expect(result.data).toBeDefined();
  expect(result.data[resultSetName]).toBeDefined();
  delete result.data[resultSetName]['__typename'];
  if (!isList) {
    expect(result.data[resultSetName]).toEqual(expected);
    return;
  }
  expect(result.data[resultSetName].items).toHaveLength(expected?.length);
  result.data[resultSetName]?.items?.forEach((item: any, index: number) => {
    delete item['__typename'];
    expect(item).toEqual(expected[index]);
  });
};

export const checkListItemExistence = (result: any, resultSetName: string, id: string, shouldExist: boolean = false) => {
  expect(result.data[`${resultSetName}`]).toBeDefined();
  expect(result.data[`${resultSetName}`].items).toBeDefined();
  expect(result.data[`${resultSetName}`].items?.filter((item: any) => item?.id === id)?.length).toEqual(shouldExist ? 1 : 0);
};

export const appendAmplifyInput = (schema: string, engine: string): string => {
  const amplifyInput = (engine: string) => {
    return `
      input AMPLIFY {
        engine: String = "${engine}",
        globalAuthRule: AuthRule = {allow: public}
      }
    `;
  };
  switch (engine) {
    case 'mysql':
      return amplifyInput(engine) + '\n' + schema;
    default:
      return schema;
  }
};

export const updatePreAuthTrigger = (projRoot: string, usernameClaim: string) => {
  const backendFunctionDirPath = path.join(projRoot, 'amplify', 'backend', 'function');
  const functionName = fs.readdirSync(backendFunctionDirPath)[0];
  const triggerHandlerFilePath = path.join(backendFunctionDirPath, functionName, 'src', 'alter-claims.js');
  const func = `
            exports.handler = async event => {
                const userGroups = [];
                event.response = {
                    claimsOverrideDetails: {
                        claimsToAddOrOverride: {
                            ${usernameClaim}: event.userName,
                        }
                    }
                };
                return event;
            };
        `;
  fs.writeFileSync(triggerHandlerFilePath, func);
};
