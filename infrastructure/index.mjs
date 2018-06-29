import { setup } from 'src/config'
import createOrUpdateStack from 'src/cloudformation'
import updateContent from 'src/s3'
import createOrUpdateLambdas from 'src/lambda'

const executeasync = async () => {
  await setup()
  await createOrUpdateStack()
  await updateContent()
  await createOrUpdateLambdas()
}

executeasync().catch(e => {
  console.error(e)
  process.exit(42)
})
