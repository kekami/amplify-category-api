## API Report File for "@aws-amplify/graphql-construct-alpha"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { AppsyncFunctionProps } from 'aws-cdk-lib/aws-appsync';
import { CfnApiKey } from 'aws-cdk-lib/aws-appsync';
import { CfnDataSource } from 'aws-cdk-lib/aws-appsync';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { CfnFunctionConfiguration } from 'aws-cdk-lib/aws-appsync';
import { CfnGraphQLApi } from 'aws-cdk-lib/aws-appsync';
import { CfnGraphQLSchema } from 'aws-cdk-lib/aws-appsync';
import { CfnResolver } from 'aws-cdk-lib/aws-appsync';
import { CfnResource } from 'aws-cdk-lib';
import { CfnRole } from 'aws-cdk-lib/aws-iam';
import { CfnTable } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { IGraphqlApi } from 'aws-cdk-lib/aws-appsync';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { NestedStack } from 'aws-cdk-lib';
import { SchemaFile } from 'aws-cdk-lib/aws-appsync';
import { TransformerPluginProvider } from '@aws-amplify/graphql-transformer-interfaces';
import { z } from 'zod';

// @public
export type AmplifyApiGraphqlSchema = SchemaFile | SchemaFile[] | string;

// @public
export type AmplifyApiSchemaPreprocessor<SchemaType> = (schema: SchemaType) => AmplifyApiSchemaPreprocessorOutput;

// @public
export type AmplifyApiSchemaPreprocessorOutput = {
    processedSchema: string;
    processedFunctionSlots?: FunctionSlot[];
};

// @public
export class AmplifyGraphqlApi<SchemaType = AmplifyGraphqlApiResources> extends Construct {
    constructor(scope: Construct, id: string, props: AmplifyGraphqlApiProps<SchemaType>);
    readonly generatedFunctionSlots: FunctionSlot[];
    readonly resources: AmplifyGraphqlApiResources;
}

// @public
export type AmplifyGraphqlApiCfnResources = {
    cfnGraphqlApi: CfnGraphQLApi;
    cfnGraphqlSchema: CfnGraphQLSchema;
    cfnApiKey?: CfnApiKey;
    cfnResolvers: Record<string, CfnResolver>;
    cfnFunctionConfigurations: Record<string, CfnFunctionConfiguration>;
    cfnDataSources: Record<string, CfnDataSource>;
    cfnTables: Record<string, CfnTable>;
    cfnRoles: Record<string, CfnRole>;
    cfnFunctions: Record<string, CfnFunction>;
    additionalCfnResources: Record<string, CfnResource>;
};

// @public
export type AmplifyGraphqlApiProps<SchemaType = AmplifyApiGraphqlSchema> = {
    schema: SchemaType;
    schemaPreprocessor?: AmplifyApiSchemaPreprocessor<SchemaType>;
    apiName?: string;
    authorizationConfig: AuthorizationConfig;
    functionNameMap?: Record<string, IFunction>;
    conflictResolution?: ConflictResolution;
    stackMappings?: Record<string, string>;
    functionSlots?: FunctionSlot[];
    transformers?: TransformerPluginProvider[];
    predictionsBucket?: IBucket;
    schemaTranslationBehavior?: Partial<SchemaTranslationBehavior>;
    outputStorageStrategy?: BackendOutputStorageStrategy<GraphqlOutput>;
};

// @public
export type AmplifyGraphqlApiResources = {
    graphqlApi: IGraphqlApi;
    tables: Record<string, ITable>;
    roles: Record<string, IRole>;
    functions: Record<string, IFunction>;
    cfnResources: AmplifyGraphqlApiCfnResources;
    nestedStacks: Record<string, NestedStack>;
};

// @public
export type ApiKeyAuthorizationConfig = {
    description?: string;
    expires: Duration;
};

// @public
export type AuthorizationConfig = {
    defaultAuthMode?: 'AWS_IAM' | 'AMAZON_COGNITO_USER_POOLS' | 'OPENID_CONNECT' | 'API_KEY' | 'AWS_LAMBDA';
    iamConfig?: IAMAuthorizationConfig;
    userPoolConfig?: UserPoolAuthorizationConfig;
    oidcConfig?: OIDCAuthorizationConfig;
    apiKeyConfig?: ApiKeyAuthorizationConfig;
    lambdaConfig?: LambdaAuthorizationConfig;
};

// @public
export type AutomergeConflictResolutionStrategy = ConflictResolutionStrategyBase & {
    handlerType: 'AUTOMERGE';
};

// @public (undocumented)
export type BackendOutputEntry<T extends Record<string, string> = Record<string, string>> = {
    readonly version: string;
    readonly payload: T;
};

// @public (undocumented)
export type BackendOutputStorageStrategy<T extends BackendOutputEntry> = {
    addBackendOutputEntry(keyName: string, backendOutputEntry: T): void;
    flush(): void;
};

// @public
export type ConflictDetectionType = 'VERSION' | 'NONE';

// @public
export type ConflictHandlerType = 'OPTIMISTIC_CONCURRENCY' | 'AUTOMERGE' | 'LAMBDA';

// @public
export type ConflictResolution = {
    project?: ConflictResolutionStrategy;
    models?: Record<string, ConflictResolutionStrategy>;
};

// @public
export type ConflictResolutionStrategy = AutomergeConflictResolutionStrategy | OptimisticConflictResolutionStrategy | CustomConflictResolutionStrategy;

// @public
export type ConflictResolutionStrategyBase = {
    detectionType: ConflictDetectionType;
    handlerType: ConflictHandlerType;
};

// @public
export type CustomConflictResolutionStrategy = ConflictResolutionStrategyBase & {
    handlerType: 'LAMBDA';
    conflictHandler: IFunction;
};

// @public
export type FunctionSlot = MutationFunctionSlot | QueryFunctionSlot | SubscriptionFunctionSlot;

// @public
export type FunctionSlotBase = {
    fieldName: string;
    slotIndex: number;
    function: FunctionSlotOverride;
};

// @public
export type FunctionSlotOverride = Partial<Pick<AppsyncFunctionProps, 'requestMappingTemplate' | 'responseMappingTemplate'>>;

// @public (undocumented)
export type GraphqlOutput = z.infer<typeof versionedGraphqlOutputSchema>;

// @public
export type IAMAuthorizationConfig = {
    identityPoolId?: string;
    authenticatedUserRole?: IRole;
    unauthenticatedUserRole?: IRole;
    adminRoles?: IRole[];
};

// @public
export type LambdaAuthorizationConfig = {
    function: IFunction;
    ttl: Duration;
};

// @public
export type MutationFunctionSlot = FunctionSlotBase & {
    typeName: 'Mutation';
    slotName: 'init' | 'preAuth' | 'auth' | 'postAuth' | 'preUpdate' | 'postUpdate' | 'finish';
};

// @public
export type OIDCAuthorizationConfig = {
    oidcProviderName: string;
    oidcIssuerUrl: string;
    clientId?: string;
    tokenExpiryFromAuth: Duration;
    tokenExpiryFromIssue: Duration;
};

// @public
export type OptimisticConflictResolutionStrategy = ConflictResolutionStrategyBase & {
    handlerType: 'OPTIMISTIC_CONCURRENCY';
};

// @public
export type QueryFunctionSlot = FunctionSlotBase & {
    typeName: 'Query';
    slotName: 'init' | 'preAuth' | 'auth' | 'postAuth' | 'preDataLoad' | 'postDataLoad' | 'finish';
};

// @public
export type SchemaTranslationBehavior = {
    shouldDeepMergeDirectiveConfigDefaults: boolean;
    disableResolverDeduping: boolean;
    sandboxModeEnabled: boolean;
    useSubUsernameForDefaultIdentityClaim: boolean;
    populateOwnerFieldForStaticGroupAuth: boolean;
    suppressApiKeyGeneration: boolean;
    secondaryKeyAsGSI: boolean;
    enableAutoIndexQueryNames: boolean;
    respectPrimaryKeyAttributesOnConnectionField: boolean;
    enableSearchNodeToNodeEncryption: boolean;
};

// @public
export type SubscriptionFunctionSlot = FunctionSlotBase & {
    typeName: 'Subscription';
    slotName: 'init' | 'preAuth' | 'auth' | 'postAuth' | 'preSubscribe';
};

// @public
export type UserPoolAuthorizationConfig = {
    userPool: IUserPool;
};

// @public (undocumented)
export const versionedGraphqlOutputSchema: z.ZodDiscriminatedUnion<"version", [z.ZodObject<{
    version: z.ZodLiteral<"1">;
    payload: z.ZodObject<{
        awsAppsyncRegion: z.ZodString;
        awsAppsyncApiEndpoint: z.ZodString;
        awsAppsyncAuthenticationType: z.ZodEnum<["API_KEY", "AWS_LAMBDA", "AWS_IAM", "OPENID_CONNECT", "AMAZON_COGNITO_USER_POOLS"]>;
        awsAppsyncApiKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        awsAppsyncRegion: string;
        awsAppsyncApiEndpoint: string;
        awsAppsyncAuthenticationType: "API_KEY" | "AMAZON_COGNITO_USER_POOLS" | "AWS_IAM" | "OPENID_CONNECT" | "AWS_LAMBDA";
        awsAppsyncApiKey?: string | undefined;
    }, {
        awsAppsyncRegion: string;
        awsAppsyncApiEndpoint: string;
        awsAppsyncAuthenticationType: "API_KEY" | "AMAZON_COGNITO_USER_POOLS" | "AWS_IAM" | "OPENID_CONNECT" | "AWS_LAMBDA";
        awsAppsyncApiKey?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    version: "1";
    payload: {
        awsAppsyncRegion: string;
        awsAppsyncApiEndpoint: string;
        awsAppsyncAuthenticationType: "API_KEY" | "AMAZON_COGNITO_USER_POOLS" | "AWS_IAM" | "OPENID_CONNECT" | "AWS_LAMBDA";
        awsAppsyncApiKey?: string | undefined;
    };
}, {
    version: "1";
    payload: {
        awsAppsyncRegion: string;
        awsAppsyncApiEndpoint: string;
        awsAppsyncAuthenticationType: "API_KEY" | "AMAZON_COGNITO_USER_POOLS" | "AWS_IAM" | "OPENID_CONNECT" | "AWS_LAMBDA";
        awsAppsyncApiKey?: string | undefined;
    };
}>]>;

// (No @packageDocumentation comment for this package)

```