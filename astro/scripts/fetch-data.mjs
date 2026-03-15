/**
 * Download books.json, persons.json, contributors.json from R2 into DATA_DIR
 * before `astro build` runs. Reads R2 credentials from environment variables.
 *
 * Usage: node astro/scripts/fetch-data.mjs
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream, mkdirSync } from "fs";
import { pipeline } from "stream/promises";

const required = (name) => {
  const val = process.env[name];
  if (!val) throw new Error(`Environment variable ${name} is not set`);
  return val;
};

const account = required("R2_ACCOUNT_ID");
const bucket  = required("R2_BUCKET_NAME");
const dataDir = process.env.DATA_DIR ?? "/astro/data";

const s3 = new S3Client({
  endpoint: `https://${account}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
  region: "auto",
});

mkdirSync(dataDir, { recursive: true });

for (const name of ["books.json", "persons.json", "contributors.json"]) {
  const key = `data/${name}`;
  const dest = `${dataDir}/${name}`;
  console.log(`Downloading ${key} → ${dest}`);
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(Body, createWriteStream(dest));
  console.log(`  done`);
}

console.log("All data files downloaded.");
