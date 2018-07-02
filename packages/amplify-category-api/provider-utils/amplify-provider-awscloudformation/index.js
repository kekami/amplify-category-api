const fs = require('fs');

let serviceMetadata;

function serviceQuestions(context, defaultValuesFilename, serviceWalkthroughFilename) {
  const serviceWalkthroughSrc = `${__dirname}/service-walkthroughs/${serviceWalkthroughFilename}`;
  const { serviceWalkthrough } = require(serviceWalkthroughSrc);

  return serviceWalkthrough(context, defaultValuesFilename, serviceMetadata);
}


function copyCfnTemplate(context, category, options, cfnFilename) {
  const { amplify } = context;
  const targetDir = amplify.pathManager.getBackendDirPath();
  const pluginDir = __dirname;

  const copyJobs = [
    {
      dir: pluginDir,
      template: `cloudformation-templates/${cfnFilename}`,
      target: `${targetDir}/${category}/${options.resourceName}/${options.resourceName}-cloudformation-template.yml`,
    },
  ];

  // copy over the files
  return context.amplify.copyBatch(context, copyJobs, options);
}

function addResource(context, category, service, options) {
  let answers;
  serviceMetadata = JSON.parse(fs.readFileSync(`${__dirname}/../supported-services.json`))[service];
  let { cfnFilename } = serviceMetadata;
  const {defaultValuesFilename, serviceWalkthroughFilename} = serviceMetadata;

  return serviceQuestions(context, defaultValuesFilename, serviceWalkthroughFilename)
    .then((result) => {
      let dependsOn;

      if(result.answers) {
        answers = result.answers;
        options.dependsOn = result.dependsOn;
      } else {
        answers = result;
      }
      if(answers.customCfnFile) {
        cfnFilename = answers.customCfnFile;
      }

      copyCfnTemplate(context, category, answers, cfnFilename);
      context.amplify.updateamplifyMetaAfterResourceAdd(
          category,
          answers.resourceName,
          options
      );
      return answers.resourceName
    });
}

module.exports = { addResource };
