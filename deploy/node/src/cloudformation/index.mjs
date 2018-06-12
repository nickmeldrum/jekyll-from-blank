import Aws from 'aws-sdk'
import getConfig from '../config'
import { getStream } from '../file/read-local-file'

let config
let s3
let cloudformation
let templateUrl

const init = async () => {
  if (s3) return
  config = await getConfig()
  s3 = new Aws.S3({
    params: { Bucket: config.stackTemplateBucket },
  })
  cloudformation = new Aws.CloudFormation()
  templateUrl = `https://s3.amazonaws.com/${
    config.stackTemplateBucket
  }/${config.stackTemplateName}`
}

export const created = async () => {
  await init()
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

  return list.StackSummaries.some(
    stack => stack.StackName === config.stackName,
  )
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
  const description = await cloudformation[describeMethod](
    params,
  ).promise()

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

const createStack = async () => {
  console.log('creating stack...')
  const stack = await cloudformation
    .createStack({
      StackName: config.stackName,
      TemplateURL: templateUrl,
      OnFailure: 'DELETE',
      Parameters: [
        {
          ParameterKey: 'BranchName',
          ParameterValue: config.branchName,
        },
      ],
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
  const changeSet = await cloudformation
    .createChangeSet({
      StackName,
      ChangeSetName: `${config.stackName}-changeset`,
      TemplateURL: templateUrl,
      ChangeSetType: 'UPDATE',
      Parameters: [
        {
          ParameterKey: 'BranchName',
          ParameterValue: config.branchName,
        },
      ],
      ResourceTypes: ['AWS::*'],
    })
    .promise()

  const changeSetDescription = await cloudformation
    .describeChangeSet({
      StackName,
      ChangeSetName: changeSet.Id,
    })
    .promise()

  try {
    await waitForChangesetCompletion({
      StackName,
      ChangeSetName: changeSet.Id,
    })
  } catch (e) {
    console.error('wait for changeset complete failed', e)
  }

  if (changeSetDescription.Status === 'FAILED') {
    if (
      changeSetDescription.StatusReason.includes(
        "didn't contain changes",
      )
    ) {
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

export const create = async () => {
  await init()
  if (await created()) throw new Error('stack already created')

  await syncTemplate()
  await validateTemplate()

  await createStack()
}

export const update = async () => {
  await init()
  const isCreated = await created()
  if (!isCreated) throw new Error('stack not created yet')

  await syncTemplate()
  const StackName = await getStackId()
  const ChangeSetId = await createChangeSet(StackName)
  if (ChangeSetId) await executeChangeSet(StackName, ChangeSetId)
}

const createOrUpdate = async () => {
  await init()
  if (await created()) await update()
  else await create()
}

export default createOrUpdate
