import {
  RDSClient,
  DescribeDBClustersCommand,
  DescribeDBClustersCommandOutput,
  DescribeDBClustersCommandInput,
  DescribeDBInstancesCommand,
  DescribeDBInstancesCommandOutput,
  DescribeDBInstancesCommandInput,
  DescribeDBSubnetGroupsCommand,
} from "@aws-sdk/client-rds";
import { 
  IAMClient, 
  CreateRoleCommand, 
  GetRoleCommand, 
  GetRoleCommandOutput, 
  CreateRoleCommandOutput, 
  Role,
  CreatePolicyCommand,
  Policy,
  CreatePolicyCommandOutput,
  AttachRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { 
  LambdaClient, 
  CreateFunctionCommand, 
  CreateFunctionCommandInput, 
  InvokeCommand, 
  LogType, 
  UpdateFunctionCodeCommand, 
  UpdateFunctionCodeCommandInput, 
  GetFunctionCommand,
  waitUntilFunctionActive,
} from "@aws-sdk/client-lambda"; 
import * as fs from 'fs-extra';

const DB_ENGINES = ["aurora-mysql", "mysql"];

export type VpcConfig = {
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
};

const checkHostInDBInstances = async (hostname: string): Promise<VpcConfig | undefined> => {
  const client = new RDSClient({});
  const params: DescribeDBInstancesCommandInput = {
    Filters: [
      {
        Name: "engine",
        Values: DB_ENGINES,
      }
    ],
  };

  const command = new DescribeDBInstancesCommand(params);
  const response: DescribeDBInstancesCommandOutput = await client.send(command);

  if (!response.DBInstances) {
    throw new Error("Error in fetching DB Instances");
  }

  const instance = response.DBInstances.find((dbInstance) => dbInstance?.Endpoint?.Address == hostname);
  if (!instance) {
    return undefined;
  }

  return {
    vpcId: instance.DBSubnetGroup.VpcId,
    subnetIds: instance.DBSubnetGroup.Subnets.map((subnet) => subnet.SubnetIdentifier),
    securityGroupIds: instance.VpcSecurityGroups.map((securityGroup) => securityGroup.VpcSecurityGroupId),
  };
};

const checkHostInDBClusters = async (hostname: string): Promise<VpcConfig | undefined> => {
  const client = new RDSClient({});
  const params: DescribeDBClustersCommandInput = {
    Filters: [
      {
        Name: "engine",
        Values: DB_ENGINES,
      }
    ],
  };

  const command = new DescribeDBClustersCommand(params);
  const response: DescribeDBClustersCommandOutput = await client.send(command);

  if (!response.DBClusters) {
    throw new Error("Error in fetching DB Clusters");
  }

  const cluster = response.DBClusters.find((dbCluster) => dbCluster?.Endpoint == hostname);
  if (!cluster) {
    return undefined;
  }

  // TODO: Clusters do not return subnet and security group information, need to investigate how it can be fetched.
  return {
    vpcId: cluster.DBSubnetGroup,
    subnetIds: await getSubnetIds(cluster.DBSubnetGroup),
    securityGroupIds: cluster.VpcSecurityGroups.map((securityGroup) => securityGroup.VpcSecurityGroupId),
  };
};

const getSubnetIds = async (subnetGroupName: string): Promise<string[]> => {
  const client = new RDSClient({});
  const command = new DescribeDBSubnetGroupsCommand({
    DBSubnetGroupName: subnetGroupName, 
  });
  const response = await client.send(command);
  const subnetGroup = response.DBSubnetGroups?.find((subnetGroup) => subnetGroup?.DBSubnetGroupName == subnetGroupName);
  return subnetGroup.Subnets?.map((subnet) => subnet.SubnetIdentifier) ?? [];
};

export const getHostVpc = async (hostname: string): Promise<VpcConfig | undefined> => {
  return (await checkHostInDBInstances(hostname)) ?? (await checkHostInDBClusters(hostname));
};

export const provisionSchemaInspectorLambda = async (lambdaName: string, vpc: VpcConfig, region: string): Promise<void> => {
  const roleName = `${lambdaName}-execution-role`;
  const iamRole = await createRoleIfNotExists(roleName);
  if (await getSchemaInspectorLambda(lambdaName)) {
    await updateSchemaInspectorLambda(lambdaName, region);
  }
  else {
    await createSchemaInspectorLambda(lambdaName, iamRole, vpc, region);
  } 
};

const getSchemaInspectorLambda = async (lambdaName: string): Promise<boolean> => {
  const lambdaClient = new LambdaClient({});
  const params = {
    FunctionName: lambdaName,
  };

  try {
    const response = await lambdaClient.send(new GetFunctionCommand(params));
    return true;
  }
  catch (err) {
    return false;
  }
};

const createSchemaInspectorLambda = async (lambdaName: string, iamRole: Role, vpc: VpcConfig, region: string): Promise<void> => {
  const lambdaClient = new LambdaClient({ region });
  
  const params: CreateFunctionCommandInput = {
    Code: {
      ZipFile: await fs.readFile(`${__dirname}/../../rds-schema-inspector.zip`),
    },
    PackageType: "Zip",
    FunctionName: lambdaName,
    Handler: "index.handler",
    Role: iamRole.Arn,
    Runtime: "nodejs16.x",
    VpcConfig: {
      SecurityGroupIds: vpc.securityGroupIds,
      SubnetIds: vpc.subnetIds,
    },
    Timeout: 30,
  };

  const response = await lambdaClient.send(new CreateFunctionCommand(params));
  await waitUntilFunctionActive({ client: lambdaClient, maxWaitTime: 600 }, { FunctionName: lambdaName });
};

const updateSchemaInspectorLambda = async (lambdaName: string, region: string): Promise<void> => {
  const lambdaClient = new LambdaClient({ region });
  
  const params: UpdateFunctionCodeCommandInput = {
    FunctionName: lambdaName,
    ZipFile: await fs.readFile(`${__dirname}/../../rds-schema-inspector.zip`),
  };

  await lambdaClient.send(new UpdateFunctionCodeCommand(params));
};

const createRoleIfNotExists = async (roleName): Promise<Role> => {
  let role = await getRole(roleName);
  if (!role) {
    role = await createRole(roleName);
  }
  return role;
};

const createPolicy = async (policyName: string): Promise<Policy | undefined> => {
  const client = new IAMClient({});
  const command = new CreatePolicyCommand({
    PolicyName: policyName,
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Resource: "*",
          Action: [
            "ec2:CreateNetworkInterface",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DeleteNetworkInterface",
          ],
        },
      ],
    }),
  });
  const result: CreatePolicyCommandOutput = await client.send(command);
  return result.Policy;
};

const createRole = async (roleName): Promise<Role | undefined> => {
  const client = new IAMClient({});
  const policy = await createPolicy(`${roleName}-policy`);
  const command = new CreateRoleCommand({
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: "lambda.amazonaws.com",
          },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    RoleName: roleName,
  });
  const result: CreateRoleCommandOutput = await client.send(command);

  const attachPolicyCommand = new AttachRolePolicyCommand({
    PolicyArn: policy.Arn,
    RoleName: roleName,
  });
  await client.send(attachPolicyCommand);

  return result.Role;
};

const getRole = async (roleName): Promise<Role | undefined> => {
  const client = new IAMClient({});
  const command = new GetRoleCommand({
    RoleName: roleName,
  });

  try {
    const response: GetRoleCommandOutput = await client.send(command);
    return response.Role;
  }
  catch (err) {
    if (err.name == "NoSuchEntityException") {
      return undefined;
    }
    throw err;
  }
};

export const invokeSchemaInspectorLambda = async (funcName, dbConfig, query) => {
  const client = new LambdaClient({});
  const command = new InvokeCommand({
    FunctionName: funcName,
    Payload: JSON.stringify({
      config: dbConfig,
      query: query,
    }) as unknown as Uint8Array,
    LogType: LogType.Tail,
  });

  const { Payload } = await client.send(command);
  const result = Buffer.from(Payload).toString();
  return result;
};
