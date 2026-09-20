import fitz,json,pathlib,hashlib
p=pathlib.Path(__file__).parent
doc=fitz.open(p/'whole-column-reconciliation.pdf')
alltext='\n'.join(page.get_text() for page in doc)
for needed in ['39','7020','ST39','R39','4476','0.059994','286','72','109','approved','shaft']:
    assert needed.lower() in alltext.lower(),needed
out=[]
for i,page in enumerate(doc):
    text=page.get_text()
    assert 'NOT FOR FABRICATION' in text
    assert f'Page {i+1} / {len(doc)}' in text
    for block in page.get_text('blocks'):
        if block[0]<0 or block[1]<0 or block[2]>page.rect.width+.5 or block[3]>page.rect.height+.5:
            out.append([i+1,list(block[:4])])
    if i==0 or any(x in text for x in ['A-01','A-02','A-03','A-04','All39','All40','Exhaustive check']):
        page.get_pixmap(matrix=fitz.Matrix(1.25,1.25)).save(p/f'review-page-{i+1}.png')
assert not out,out
(p/'report-text.txt').write_text(alltext)
(p/'inspection.json').write_text(json.dumps({'pages':len(doc),'outOfPageTextBlocks':out,'requiredContent':'PASS','watermarksAndFooters':'PASS'},indent=2))
before=(p/'saved-evidence.json').read_bytes()
after=(p/'saved-evidence-after.json').read_bytes()
filesbefore=(p/'application-files-before.sha256').read_bytes()
filesafter=(p/'application-files-after.sha256').read_bytes()
assert before==after
assert filesbefore==filesafter
(p/'preservation-verification.json').write_text(json.dumps({
    'savedScientificEvidenceByteIdentical':True,
    'savedEvidenceFileSha256BeforeAndAfter':hashlib.sha256(before).hexdigest(),
    'applicationFilesChecked':len(filesbefore.splitlines()),
    'applicationFilesUnchanged':True,
    'sourceListSha256BeforeAndAfter':hashlib.sha256(filesbefore).hexdigest(),
    'upstreamAuditRerun':False,
    'productionImplementationChanged':False,
},indent=2))
print(json.dumps({'pages':len(doc),'bounds':'PASS','preservation':'PASS'}))