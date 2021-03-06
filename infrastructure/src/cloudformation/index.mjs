import Aws from 'aws-sdk'
import getConfig from 'src/config'
import { getStream } from 'src/file/read-local-file'
import updateCertificate from 'src/acm'

let config
let s3
let cloudformation
let templateUrl
let certArn

const init = async () => {
  if (s3) return
  config = await getConfig()
  s3 = new Aws.S3({
    params: { Bucket: config.stackTemplateBucket },
  })
  cloudformation = new Aws.CloudFormation()
  templateUrl = `https://s3.amazonaws.com/${config.stackTemplateBucket}/${
    config.stackTemplateName
  }`
}

const created = async () => {
  const list = await cloudformation
    .listStacks({
      StackStatusFilter: [
        'CREATE_IN_PROGRESS',
        'CREATE_FAILED',
        'CREATE_COMPLETE',
        'UPDATE_IN_PROGRESS',
        'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_IN_PROGRESS',
        'UPDATE_ROLLBACK_FAILED',
        'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
        'UPDATE_ROLLBACK_COMPLETE',
        'REVIEW_IN_PROGRESS',
      ],
    })
    .promise()

  return list.StackSummaries.some(stack => stack.StackName === config.stackName)
}

const syncTemplate = async () => {
  console.log('syncing template...')
  console.log(
    await s3
      .upload({
        Key: config.stackTemplateName,
        Body: getStream(`templates/${config.stackTemplateName}`),
      })
      .promise(),
  )
}

const validateTemplate = async () => {
  console.log('validating template...')
  await cloudformation
    .validateTemplate({
      TemplateURL: templateUrl,
    })
    .promise()
}

const waitFor = (type, describeMethod) => async params => {
  console.log(`wait for ${type}...`)
  await cloudformation.waitFor(type, params).promise()

  console.log('wait over!')
  const description = await cloudformation[describeMethod](params).promise()

  console.log(description)
}

const waitForStackCreateCompletion = waitFor(
  'stackCreateComplete',
  'listStackResources',
)
const waitForStackUpdateCompletion = waitFor(
  'stackUpdateComplete',
  'listStackResources',
)
const waitForChangesetCompletion = waitFor(
  'changeSetCreateComplete',
  'describeChangeSet',
)

const getParameters = () => [
  {
    ParameterKey: 'BranchName',
    ParameterValue: config.branchName,
  },
  {
    ParameterKey: 'ProdCertificateArn',
    ParameterValue: certArn,
  },
]

const createStack = async () => {
  console.log('creating stack...')
  const stack = await cloudformation
    .createStack({
      StackName: config.stackName,
      TemplateURL: templateUrl,
      OnFailure: 'ROLLBACK',
      Parameters: getParameters(),
      ResourceTypes: ['AWS::*'],
    })
    .promise()
  console.log(stack)
  await waitForStackCreateCompletion({
    StackName: stack.StackId,
  })
  return stack
}

const getStackId = async () => {
  const stack = await cloudformation
    .describeStacks({
      StackName: config.stackName,
    })
    .promise()
  const stackId = stack.Stacks[0].StackId
  console.log(`stack id: ${stackId}`)
  return stackId
}

const createChangeSet = async StackName => {
  console.log('creating changeset...')
  const timestamp = Number(new Date())
  const changeSet = await cloudformation
    .createChangeSet({
      StackName,
      ChangeSetName: `${config.stackName}-changeset-${timestamp}`,
      TemplateURL: templateUrl,
      ChangeSetType: 'UPDATE',
      Parameters: getParameters(),
      ResourceTypes: ['AWS::*'],
    })
    .promise()

  const changeSetDescription = await cloudformation
    .describeChangeSet({
      StackName,
      ChangeSetName: changeSet.Id,
    })
    .promise()

  console.log(changeSetDescription)

  try {
    await waitForChangesetCompletion({
      StackName,
      ChangeSetName: changeSet.Id,
    })
  } catch (e) {
    console.warn('wait for changeset complete failed', e)
  }

  if (changeSetDescription.Status === 'FAILED') {
    if (changeSetDescription.StatusReason.includes("didn't contain changes")) {
      console.log('changeset had no changes...')
      return null
    }
    throw new Error(changeSetDescription.StatusReason)
  }

  return changeSet.Id
}

const executeChangeSet = async (StackName, ChangeSetName) => {
  console.log('executing changeset...')
  await cloudformation
    .executeChangeSet({
      StackName,
      ChangeSetName,
    })
    .promise()
  await waitForStackUpdateCompletion({
    StackName,
  })
}

const create = async () => {
  if (await created()) throw new Error('stack already created')

  await validateTemplate()

  await createStack()
}

const update = async () => {
  const isCreated = await created()
  if (!isCreated) throw new Error('stack not created yet')

  const StackName = await getStackId()
  const ChangeSetId = await createChangeSet(StackName)
  if (ChangeSetId) await executeChangeSet(StackName, ChangeSetId)
}

const createOrUpdate = async () => {
  console.log('## create or update stack ##')
  await init()
  certArn = await updateCertificate()
  await syncTemplate()
  if (await created()) await update()
  else await create()
}

const getStackResourceInfo = async () => {
  const StackName = await getStackId()

  console.log('getting stack resource info...')
  const resources = await cloudformation
    .listStackResources({
      StackName,
    })
    .promise()

  console.log(resources)
  return resources
}

export const getResourceId = async resourceName => {
  await init()
  const resources = await getStackResourceInfo()
  return resources.StackResourceSummaries.find(
    r => r.LogicalResourceId === resourceName,
  ).PhysicalResourceId
}

export default createOrUpdate
