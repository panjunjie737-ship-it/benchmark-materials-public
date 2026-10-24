import {read,utils} from './xlsx.1a0fb062ee97.mjs';

export const ACCOUNT_TABLE_HEADERS=['账号','昵称','国家/地区','类目','标签'];
const ALIASES={
  account:['账号','账号id','用户名','账号链接','主页链接','tiktok账号','account','username','handle','profileurl','tiktokurl'],
  display_name:['昵称','显示名称','账号昵称','displayname','nickname'],
  country:['国家','地区','国家/地区','账号国家','country','market'],
  categories:['类目','产品类目','所属类目','category','categories'],
  tags:['标签','定位','账号定位','tags','position'],
};
const clean=value=>String(value??'').trim();
const unique=values=>[...new Set(values)];
const length=value=>[...value].length;
const headerKey=value=>clean(value).toLowerCase().replace(/[\s_\ufeff]/g,'');
const split=value=>unique(clean(value).split(/[,，;；|、\n]+/).map(clean).filter(Boolean));
function checkText(value,max,label){if(length(value)>max)throw new Error(`${label}超过 ${max} 个字`);if(/[\x00-\x1f\x7f-\x9f\ud800-\udfff]/u.test(value))throw new Error(`${label}含控制字符`);return value;}
function username(value){
  let name=clean(value);
  if(/^https?:/i.test(name)){
    let url;try{url=new URL(name);}catch{throw new Error('账号链接格式不正确');}
    if(!['www.tiktok.com','tiktok.com','m.tiktok.com'].includes(url.hostname.toLowerCase())||url.username||url.password||url.port||/\\/.test(name))throw new Error('请填写 TikTok 主页链接或账号');
    const match=url.pathname.match(/^\/@([^/]+)\/?$/);if(!match)throw new Error('请填写账号主页，不能填写视频链接');name=match[1];
  }
  name=name.replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_][a-z0-9._]{1,23}$/.test(name)||name.includes('..')||name.endsWith('.'))throw new Error('账号需为 2–24 位字母、数字、下划线或点');
  return name;
}

// Inspect the ZIP directory before invoking the XLSX parser to bound decompression.
function checkZip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--){if(view.getUint32(at,true)===0x06054b50){end=at;break;}}
  if(end<0)throw new Error('Excel 文件不完整或格式不正确');
  const entries=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||entries!==view.getUint16(end+8,true)||entries>2048||offset+size!==end||end+22+view.getUint16(end+20,true)!==bytes.length)throw new Error('Excel 压缩结构超出限制');
  let at=offset,total=0;const names=new Set(),blocks=[];
  const checkExtra=(start,size)=>{let end=start+size;while(start<end){if(start+4>end)throw new Error('Excel 压缩扩展字段错误');const id=view.getUint16(start,true),n=view.getUint16(start+2,true);if(id===1||start+4+n>end)throw new Error('Excel 压缩扩展字段不受支持');start+=4+n;}};
  for(let i=0;i<entries;i++){
    if(at+46>offset+size||view.getUint32(at,true)!==0x02014b50)throw new Error('Excel 压缩目录不完整');
    const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),compressed=view.getUint32(at+20,true),expanded=view.getUint32(at+24,true),nameLen=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
    if(at+46+nameLen+extra+comment>offset+size)throw new Error('Excel 压缩目录不完整');
    const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+nameLen));
    if(flags&9||![0,8].includes(method)||view.getUint16(at+34,true)!==0||expanded===0xffffffff||names.has(name)||/vbaProject\.bin$/i.test(name)||expanded>Math.max(1,compressed)*200||(expanded===0&&compressed>2))throw new Error('Excel 含加密、宏或不支持的压缩内容，请用 Excel 另存为 XLSX');
    if(local+30>offset||view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method||view.getUint32(local+14,true)!==crc||view.getUint32(local+18,true)!==compressed||view.getUint32(local+22,true)!==expanded||view.getUint16(local+26,true)!==nameLen)throw new Error('Excel 压缩头不一致');
    const localExtra=view.getUint16(local+28,true),dataStart=local+30+nameLen+localExtra,dataEnd=dataStart+compressed;
    if(dataEnd>offset||new TextDecoder().decode(bytes.subarray(local+30,local+30+nameLen))!==name||(method===0&&compressed!==expanded))throw new Error('Excel 压缩数据范围不正确');
    checkExtra(at+46+nameLen,extra);checkExtra(local+30+nameLen,localExtra);blocks.push([local,dataEnd]);
    total+=expanded;if(total>30*1024*1024)throw new Error('Excel 解压后超过 30 MB');names.add(name);at+=46+nameLen+extra+comment;
  }
  if(at!==offset+size)throw new Error('Excel 压缩目录大小不一致');
  blocks.sort((a,b)=>a[0]-b[0]);if(blocks.some((block,i)=>i&&block[0]<blocks[i-1][1]))throw new Error('Excel 压缩数据重叠');
  if(!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))throw new Error('请使用标准 .xlsx 工作簿');
}
function makePayload(row,filename,sheet){
  const import_data={schema_version:1,display_name:row.display_name,categories:row.categories,tags:row.tags,source_file:filename,source_sheet:sheet,source_rows:row.row_numbers};
  const payload={account:'@'+row.account,country:row.country,category_label:row.categories.length===1?row.categories[0]:'',reason:'表格提交',import_data};
  if(new TextEncoder().encode(JSON.stringify({...payload,browser_key:'x'.repeat(80)})).length>8000)throw new Error('此账号合并后的信息过多，请拆分整理后重试');
  return payload;
}

export async function previewAccountTable(input,filename,knownAccounts=[]){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  filename=checkText(clean(filename),200,'文件名');
  if(/[\\/:]/.test(filename))throw new Error('文件名不能包含路径');
  if(bytes.length>5*1024*1024)throw new Error('表格不能超过 5 MB');
  if(!/\.(xlsx|csv)$/i.test(filename))throw new Error('请选择 .xlsx 或 .csv 文件');
  if(!bytes.length)throw new Error('表格文件为空');
  const isXlsx=/\.xlsx$/i.test(filename);if(isXlsx)checkZip(bytes);
  let workbook;
  try{workbook=read(isXlsx?bytes:new TextDecoder('utf-8',{fatal:true}).decode(bytes),{type:isXlsx?'array':'string',raw:true,cellFormula:true,cellHTML:false,cellStyles:false,bookVBA:false,sheetRows:502});}
  catch{throw new Error('无法读取表格，请使用未加密的 XLSX 或 UTF-8 CSV');}
  const populated=workbook.SheetNames.filter(name=>workbook.Sheets[name]?.['!ref']);
  if(populated.length!==1)throw new Error('请保留一个有数据的工作表再上传');
  const sheet=checkText(populated[0],100,'工作表名'),ws=workbook.Sheets[sheet],range=utils.decode_range(ws['!fullref']||ws['!ref']);
  if(range.e.r>500||range.e.c>31)throw new Error('每次最多 500 行数据、32 列');
  for(const [key,cell] of Object.entries(ws)){if(key.startsWith('!'))continue;if(cell.f)throw new Error('表格含公式，请先粘贴为值');if(length(String(cell.v??''))>1000)throw new Error('单元格内容超过 1000 个字');}
  const data=utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:true,range:0});
  const names=(data[0]||[]).map(headerKey),columns={};
  for(const [field,aliases] of Object.entries(ALIASES)){
    const positions=names.map((name,index)=>aliases.includes(name)?index:-1).filter(index=>index>=0);
    if(positions.length!==1)throw new Error('表头应包含且不重复：账号、昵称、国家/地区、类目、标签');columns[field]=positions[0];
  }
  const known=new Set(knownAccounts.map(item=>{try{return username(item.username||item.account||'');}catch{return '';}}));
  const rows=[],byAccount=new Map();let total_rows=0;
  for(let index=1;index<data.length;index++){
    const cells=data[index];if(!cells.some(value=>clean(value)))continue;total_rows++;
    const values=Object.fromEntries(Object.entries(columns).map(([field,col])=>[field,clean(cells[col])]));
    const row={row_numbers:[index+1],account:values.account,display_name:values.display_name,country:values.country==='美区'?'美国':values.country,categories:split(values.categories),tags:split(values.tags),status:'ready',message:'待提交审核'};
    try{
      if(Object.values(values).some(value=>value.startsWith('=')))throw new Error('单元格含公式，请先粘贴为值');
      row.account=username(row.account);checkText(row.display_name,160,'昵称');checkText(row.country,60,'国家/地区');
      for(const [label,list,max] of [['类目',row.categories,20],['标签',row.tags,30]]){if(list.length>max)throw new Error(`${label}数量超过 ${max}`);for(const value of list)checkText(value,80,label);}
      const prior=byAccount.get(row.account);
      if(prior){
        prior.row_numbers.push(index+1);
        if((prior.display_name&&row.display_name&&prior.display_name!==row.display_name)||(prior.country&&row.country&&prior.country!==row.country)){
          prior.status='conflict';prior.message='同一账号的昵称或国家不一致，请在表格中核对';delete prior.payload;
        }else{
          prior.display_name||=row.display_name;prior.country||=row.country;
          prior.categories=unique([...prior.categories,...row.categories]);prior.tags=unique([...prior.tags,...row.tags]);
          if(prior.categories.length>20||prior.tags.length>30){prior.status='invalid';prior.message='合并后的类目或标签数量超出限制';delete prior.payload;}
          else if(prior.status==='ready'){try{prior.payload=makePayload(prior,filename,sheet);prior.message='重复行已合并，待提交审核';}catch(error){prior.status='invalid';prior.message=error.message;delete prior.payload;}}
        }
        continue;
      }
      byAccount.set(row.account,row);
      if(known.has(row.account)){row.status='duplicate';row.message='网站已有此账号，不重复提交或覆盖';}
      else row.payload=makePayload(row,filename,sheet);
    }catch(error){row.status='invalid';row.message=error.message;}
    rows.push(row);
  }
  if(!total_rows)throw new Error('表格中没有账号数据');
  return {filename,sheet,total_rows,rows,valid_count:rows.filter(row=>row.status==='ready').length,duplicate_count:rows.filter(row=>row.status==='duplicate').length,invalid_count:rows.filter(row=>['invalid','conflict'].includes(row.status)).length};
}
