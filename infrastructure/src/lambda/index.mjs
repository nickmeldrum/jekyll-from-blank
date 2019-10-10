import Aws from 'aws-sdk'
import getConfig from 'src/config'
import { readBinaryFileSync } from 'src/file/read-local-file'
import { updateDistributionWithLambda } from 'src/cloudfront'

let config
let lambda

const init = async () => {
  if (lambda) return
  config = await getConfig()
  lambda = new Aws.Lambda({})
}

const created = async () => {
  const list = await lambda.listFunctions({}).promise()

  return list.Functions.some(
    func => func.FunctionName === config.lambdaName,
  )
}

const create = async () => {
  if (await created()) throw new Error('lambda already created')

  console.log('creating lambda...')

  const func = await lambda
    .createFunction({
      FunctionName: config.lambdaName,
      Code: {
        ZipFile: readBinaryFileSync(config.lambdaZipLocation),
      },
      Runtime: 'nodejs10.x',
      Role: config.lambdaServiceRole,
      Handler: 'index.handler',
      Publish: true,
    })
    .promise()

  console.log(func)
  return func.FunctionArn
}

const update = async () => {
  const isCreated = await created()
  if (!isCreated) throw new Error('lambda not created yet')

  console.log('updating lambda...')

  const func = await lambda
    .updateFunctionCode({
      FunctionName: config.lambdaName,
      ZipFile: readBinaryFileSync(config.lambdaZipLocation),
      Publish: true,
    })
    .promise()

  console.log(func)
  return func.FunctionArn
}

const createOrUpdate = async () => {
  console.log('## create or update lambda ##')
  await init()

  let lambdaArn
  if (await created()) lambdaArn = await update()
  else lambdaArn = await create()

  updateDistributionWithLambda(lambdaArn)
}

export default createOrUpdate
