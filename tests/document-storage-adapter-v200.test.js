const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const storage=fs.readFileSync(path.join(__dirname,'..','api','_lib','document-storage.js'),'utf8');
const upload=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','upload-ticket.js'),'utf8');
const finalize=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','finalize.js'),'utf8');
const download=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','[id]','download-ticket.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','api','_lib','runtime-config.js'),'utf8');
const pkg=require('../package.json');

test('document storage ticket is encrypted and storage keys are opaque',()=>{
  assert.ok(storage.includes("createCipheriv('aes-256-gcm'"));
  assert.ok(storage.includes("createDecipheriv('aes-256-gcm'"));
  assert.ok(storage.includes("'quarantine/'+crypto.randomUUID().replace(/-/g,'')"));
  assert.ok(storage.includes("['application/pdf','image/jpeg','image/png']"));
});

test('CI memory provider is explicitly non-production only',()=>{
  assert.ok(storage.includes("if(isProductionRuntime())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY'"));
  assert.ok(runtime.includes("provider==='ci-memory'&&isNonProductionRuntime()"));
});

test('Vercel private Blob transport uses short-lived private signed URLs',()=>{
  assert.equal(pkg.dependencies['@vercel/blob'],'2.8.0');
  assert.ok(storage.includes("VERCEL_PRIVATE_PROVIDER='vercel-blob-private'"));
  assert.ok(storage.includes("operations:[operation]"));
  assert.ok(storage.includes("access:'private'"));
  assert.ok(storage.includes("allowOverwrite=false"));
  assert.ok(storage.includes("addRandomSuffix=false"));
  assert.ok(storage.includes("signOptions.useCache=Boolean(useCache)"));
  assert.ok(storage.includes("malware_status:'pending'"));
  assert.equal(storage.includes("access:'public'"),false);
});

test('production storage transport and malware readiness are separate fail-closed gates',()=>{
  assert.ok(runtime.includes('function documentStorageTransportReady()'));
  assert.ok(runtime.includes('function documentMalwareScannerReady()'));
  assert.ok(runtime.includes('function originalDocumentPipelineReady()'));
  assert.ok(runtime.includes('originalDocumentPipelineReady()'));
  assert.ok(finalize.includes('DOCUMENT_ORIGINAL_PIPELINE_NOT_READY'));
});

test('original upload/finalize/download APIs use the provider-neutral adapter',()=>{
  assert.ok(upload.includes('getDocumentStorageAdapter'));
  assert.ok(upload.includes('encryptTicket'));
  assert.ok(upload.includes('prepareDocumentUpload'));
  assert.ok(finalize.includes('decryptTicket'));
  assert.ok(finalize.includes('readQuarantineForScan'));
  assert.ok(finalize.includes('reserveDocumentOriginal'));
  assert.ok(finalize.includes('activateDocumentOriginal'));
  assert.ok(download.includes('createDownloadAuthorization'));
  assert.ok(download.includes('auditDocumentDownload'));
});

test('finalize returns no raw storage key or internal SHA',()=>{
  assert.ok(finalize.includes('function publicDocument'));
  assert.equal(finalize.includes('storage_key:d.storage_key'),false);
  assert.equal(finalize.includes('content_sha256:d.content_sha256'),false);
});


test('Vercel private Blob adapter signs constrained operations and remains scan-pending',async()=>{
  const saved={
    VERCEL_ENV:process.env.VERCEL_ENV,
    TSUBAME_DOCUMENT_STORAGE_PROVIDER:process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER,
    TSUBAME_DOCUMENT_TICKET_SECRET:process.env.TSUBAME_DOCUMENT_TICKET_SECRET,
    BLOB_READ_WRITE_TOKEN:process.env.BLOB_READ_WRITE_TOKEN
  };
  const mod=require('../api/_lib/document-storage');
  const calls=[];
  const bytes=Buffer.from('%PDF-1.7\nfake private original\n%%EOF','utf8');
  try{
    process.env.VERCEL_ENV='production';
    process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER='vercel-blob-private';
    process.env.TSUBAME_DOCUMENT_TICKET_SECRET='12345678901234567890123456789012';
    process.env.BLOB_READ_WRITE_TOKEN='test-private-token';
    mod._test.setBlobSdk({
      async issueSignedToken(options){calls.push({kind:'issue',options});return {delegationToken:'d',clientSigningToken:'s'}},
      async presignUrl(_token,options){calls.push({kind:'presign',options});return {presignedUrl:'https://blob.invalid/'+options.operation}}
    });
    mod._test.setFetch(async(url,options)=>{
      const operation=String(url).split('/').pop();
      if(operation==='head')return {
        ok:true,
        headers:{get(k){return {'content-type':'application/pdf','content-length':String(bytes.length),'etag':'"etag-private-1"'}[String(k).toLowerCase()]||null}}
      };
      if(operation==='get')return {ok:true,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}};
      throw new Error('unexpected fetch '+url+' '+options?.method)
    });
    const adapter=mod.getDocumentStorageAdapter();
    assert.equal(await mod.probeDocumentStorageTransport(),true);
    const key='quarantine/0123456789abcdef0123456789abcdef';
    const uploadAuth=await adapter.createUploadAuthorization({storageKey:key,contentType:'application/pdf',sizeBytes:bytes.length,expiresSeconds:60});
    assert.equal(uploadAuth.method,'PUT');
    assert.equal(uploadAuth.upload_url,'https://blob.invalid/put');
    const putSign=calls.find(x=>x.kind==='presign'&&x.options.operation==='put').options;
    assert.equal(putSign.access,'private');
    assert.equal(putSign.allowOverwrite,false);
    assert.equal(putSign.addRandomSuffix,false);
    assert.deepEqual(putSign.allowedContentTypes,['application/pdf']);
    assert.equal(putSign.maximumSizeInBytes,bytes.length);

    const inspected=await adapter.inspectQuarantine(key);
    assert.equal(inspected.content_type,'application/pdf');
    assert.equal(inspected.size_bytes,bytes.length);
    assert.match(inspected.sha256,/^[0-9a-f]{64}$/);
    assert.equal(inspected.malware_status,'pending');
    assert.equal(inspected.malware_scanned_at,null);
    const scanRead=await adapter.readQuarantineForScan(key);
    assert.deepEqual(scanRead.bytes,bytes);

    const downloadAuth=await adapter.createDownloadAuthorization({storageKey:key,expiresSeconds:60});
    assert.equal(downloadAuth.download_url,'https://blob.invalid/get');
    const getSign=calls.filter(x=>x.kind==='presign'&&x.options.operation==='get').at(-1).options;
    assert.equal(getSign.access,'private');
    assert.equal(getSign.useCache,false);
  }finally{
    mod._test.resetTestOverrides();
    for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}
  }
});
