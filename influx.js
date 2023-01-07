const {InfluxDB, Point} = require('@influxdata/influxdb-client')

var INFLUXDB_TOKEN="URDTswYo5DMSN4y-oKAj3pCjubH2UPT1WR_JLZV3Qy1h6a-d_G9w190FxbdqL1npgyPSdXM4SY62WEVjuWCTQQ=="
const token = INFLUXDB_TOKEN
const url = 'https://us-east-1-1.aws.cloud2.influxdata.com'

const client = new InfluxDB({url, token})

let org = `iot`
let bucket = `iot`

let writeClient = client.getWriteApi(org, bucket, 'ns')

for (let i = 0; i < 5; i++) {
  let point = new Point('measurement1')
    .tag('tagname1', 'tagvalue1')
    .intField('field1', i)

  void setTimeout(() => {
    writeClient.writePoint(point)
  }, i * 1000) // separate points by 1 second

  void setTimeout(() => {
    writeClient.flush()
  }, 5000)
}