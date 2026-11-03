// One explicitly reviewed metadata draft; no corpus scan, source body or network.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { validateTitleOnlyBindings,loadTitleContext } from './check-title-only-editions.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
try{
 const [flag,input,hashFlag,expected]=process.argv.slice(2)
 if(process.argv.length!==6||flag!=='--input'||hashFlag!=='--sha256'||!/^[a-f0-9]{64}$/.test(expected||''))throw new Error('Supply --input reviewed-metadata.json --sha256 reviewed-digest')
 const bytes=fs.readFileSync(input)
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Reviewed metadata digest mismatch')
 const document=JSON.parse(bytes),counts=validateTitleOnlyBindings(document,loadTitleContext())
 fs.writeFileSync(path.join(root,'public/data/us-editions.json'),JSON.stringify(document,null,2)+'\n')
 console.log(JSON.stringify({exit:0,...counts}))
}catch(error){console.error(error.message);process.exitCode=1}
