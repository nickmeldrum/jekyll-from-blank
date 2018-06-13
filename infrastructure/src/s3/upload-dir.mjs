import fs from 'fs'
import path from 'path'
import Aws from 'aws-sdk'
import dirname from '../file/dir-name'

let s3

const init = async Bucket => {
  if (s3) return
  s3 = new Aws.S3({
    params: { Bucket },
  })
}

export default async (bucket, sourcePath) => {
  await init(bucket)
  const fullSourcePath = path.join(dirname, '../..', sourcePath)

  const walkSync = (currentDirPath, callback) => {
    fs.readdirSync(currentDirPath).forEach(name => {
      const filePath = path.join(currentDirPath, name)
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        callback(filePath, stat)
      } else if (stat.isDirectory()) {
        walkSync(filePath, callback)
      }
    })
  }

  walkSync(fullSourcePath, async filePath => {
    const bucketPath = filePath.substring(
      fullSourcePath.length + 1,
    )
    const params = {
      Key: bucketPath,
      Body: fs.readFileSync(filePath),
    }
    console.log(await s3.upload(params).promise())
  })
}
