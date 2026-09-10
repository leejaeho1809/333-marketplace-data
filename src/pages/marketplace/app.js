var CATEGORIES = ['ALL','BODY','RECOVERY','HYDRATION','SAUNA','FITNESS','SLEEP','LONGEVITY','SUPPLEMENT','LIFESTYLE'];

var state = { tab:'discover', filter:'ALL', view:'grid', showDeleted:false };

function toggleShowDeleted(){
  state.showDeleted = !state.showDeleted;
  render();
}

function setView(v){
  state.view = v;
  document.getElementById('viewGrid').classList.toggle('active', v==='grid');
  document.getElementById('viewList').classList.toggle('active', v==='list');
  document.getElementById('cardGrid').classList.toggle('list-view', v==='list');
}
var store = {};
function getEntry(id){
  if(!store[id]) store[id] = {status:null, deleteReason:null, comments:[]};
  var e = store[id];
  if(!e.comments) e.comments = [];
  if(e.feedback){
    e.comments.unshift({author:'(이전 메모)', text:e.feedback, ts:e.feedbackTs || Date.now()});
    delete e.feedback;
    delete e.feedbackTs;
    saveStore(store);
  }
  return e;
}
function saveStore(s){
  store = s;
  syncBrandEntries(s);
}

var USERNAME_KEY = 'brand333_username';
function loadUsername(){
  try{ return localStorage.getItem(USERNAME_KEY) || ''; }catch(e){ return ''; }
}
function saveUsername(name){
  try{ localStorage.setItem(USERNAME_KEY, name); }catch(e){}
}

function renderComments(entry){
  if(!entry.comments || !entry.comments.length){
    return '<div class="comment-empty">아직 댓글이 없어요.</div>';
  }
  return entry.comments.slice().sort(function(a,b){ return b.ts - a.ts; }).map(function(c){
    var d = new Date(c.ts);
    var dateStr = (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    return '<div class="comment-item">' +
      '<div class="comment-head"><span class="comment-author">' + c.author + '</span><span class="comment-date">' + dateStr + '</span></div>' +
      '<div class="comment-text">' + c.text.replace(/</g,'&lt;') + '</div>' +
    '</div>';
  }).join('');
}

function addComment(id){
  var authorEl = document.getElementById('commentAuthor');
  var textEl = document.getElementById('commentText');
  var author = authorEl.value.trim() || '익명';
  var text = textEl.value.trim();
  if(!text) return;
  var entry = getEntry(id);
  entry.comments.push({author: author, text: text, ts: Date.now()});
  saveStore(store);
  saveUsername(author);
  openModal(id);
}

/* ---- image storage: Supabase Storage bucket, indexed by the 'brand_images' table ----
   The actual image bytes live in the 'brand-images' Storage bucket (public), keyed by
   the same 'hero:<id>' / 'bs:<id>:<idx>' strings used everywhere else in this file.
   'brand_images' itself only holds {id, updated_at} now — it's the Realtime-enabled
   index that tells every open tab an image changed and when, so the public URL can be
   cache-busted (the object's browser-visible content changes, but its path doesn't). */
var IMAGE_BUCKET = 'brand-images';
function imagePublicUrl(key, updatedAt){
  var url = supa().storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl;
  var v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return url + (url.indexOf('?')===-1 ? '?' : '&') + 'v=' + v;
}
function idbSet(key, dataUrlOrHttpUrl){
  imageCache[key] = dataUrlOrHttpUrl; /* optimistic local preview until the upload round-trips */
  return fetch(dataUrlOrHttpUrl).then(function(res){ return res.blob(); }).then(function(blob){
    return supa().storage.from(IMAGE_BUCKET).upload(key, blob, {upsert:true, contentType: blob.type || 'image/jpeg'});
  }).then(throwIfError).then(function(){
    return supa().from('brand_images').upsert({id:key}).then(throwIfError);
  }).then(function(){
    imageCache[key] = imagePublicUrl(key, Date.now());
    render();
    var brandId = brandIdFromImageKey(key);
    if(brandId) refreshModalIfOpen(brandId);
  });
}
function idbDelete(key){
  delete imageCache[key];
  return supa().storage.from(IMAGE_BUCKET).remove([key]).then(throwIfError).then(function(){
    return supa().from('brand_images').delete().eq('id', key).then(throwIfError);
  });
}
function idbGetAll(){
  return supa().from('brand_images').select('*').then(function(res){
    throwIfError(res);
    var result = {};
    res.data.forEach(function(row){ result[row.id] = imagePublicUrl(row.id, row.updated_at); });
    return result;
  });
}
var imageCache = {}; /* keys: 'hero:<id>' and 'bs:<id>:<idx>'; kept in sync via Supabase Realtime */

function setHeroImage(id, dataUrl){
  imageCache['hero:'+id] = dataUrl;
  idbSet('hero:'+id, dataUrl).catch(function(){
    alert('이미지 저장에 실패했어요. 다른 이미지로 시도해보시거나, 브라우저 저장 공간을 확인해주세요.');
  });
  var entry = getEntry(id);
  entry.imageCleared = false;
  saveStore(store);
}
function setBsImage(id, idx, dataUrl){
  var key = 'bs:'+id+':'+idx;
  imageCache[key] = dataUrl;
  idbSet(key, dataUrl).catch(function(){
    alert('이미지 저장에 실패했어요. 다른 이미지로 시도해보시거나, 브라우저 저장 공간을 확인해주세요.');
  });
}

function getImgSrc(b, entry){
  if(entry.imageCleared) return null;
  return imageCache['hero:'+b.id] || b.imgFile || null;
}

function hasReliableImage(b, entry){
  if(entry.imageCleared) return false;
  if(imageCache['hero:'+b.id]) return true;
  if(b.imgFile && b.imgFile.indexOf('data:')===0) return true;
  return false;
}

function clearImage(id){
  var entry = getEntry(id);
  entry.imageCleared = true;
  saveStore(store);
  delete imageCache['hero:'+id];
  idbDelete('hero:'+id).catch(function(){});
  render();
  var modalOpen = document.getElementById('modalBg').classList.contains('open');
  if(modalOpen) openModal(id);
}

function clearBsImage(id, idx){
  var key = 'bs:'+id+':'+idx;
  delete imageCache[key];
  idbDelete(key).catch(function(){});
  openModal(id);
}

var brands = []; /* every brand record — fetched from Supabase, no hardcoded seed data */
function saveBrands(list){
  brands = list;
  syncBrands(list);
}

function getAllBrands(){
  return brands;
}

function removeCustomBrand(id){
  brands = brands.filter(function(b){ return b.id!==id; });
  saveBrands(brands);
  delete store[id];
  saveStore(store);
  closeModal();
  render();
}

function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(function(){ t.classList.remove('show'); }, 1800);
}

var afSelectedCats = [];

/* approximate KRW conversion rates (2026.08 기준, 대략치) */
var CURRENCY_RATES = { KRW:1, USD:1380, JPY:8.6, EUR:1595, GBP:1750, AUD:990, NZD:830, TWD:43.3, THB:41.6, CNY:193 };
var CURRENCY_FORMAT = {
  USD: function(n){ return '$' + n; },
  JPY: function(n){ return n + '엔'; },
  EUR: function(n){ return n + '€'; },
  GBP: function(n){ return '£' + n; },
  AUD: function(n){ return 'A$' + n; },
  NZD: function(n){ return 'NZ$' + n; },
  TWD: function(n){ return 'NT$' + n; },
  THB: function(n){ return n + '฿'; },
  CNY: function(n){ return '¥' + n; },
  KRW: function(n){ return n + '원'; }
};
function formatLocalPrice(amount, currency){
  var n = Number(amount).toLocaleString();
  var fn = CURRENCY_FORMAT[currency] || function(x){ return x + ' ' + currency; };
  return fn(n);
}
function computeKrw(amount, currency){
  if(currency==='KRW') return null;
  var rate = CURRENCY_RATES[currency];
  if(!rate || !amount) return null;
  var krw = Math.round(Number(amount) * rate / 100) * 100;
  return '약 ' + krw.toLocaleString() + '원';
}
function updateBsKrwPreview(i){
  var amount = document.getElementById('bsAmount'+i).value;
  var currency = document.getElementById('bsCurrency'+i).value;
  var el = document.getElementById('bsKrwPreview'+i);
  if(!amount){ el.textContent = ''; return; }
  var krw = computeKrw(amount, currency);
  el.textContent = krw ? formatLocalPrice(amount, currency) + '  →  ' + krw : '';
}

/* try to parse an existing priceLocal string back into {amount, currency} for editing */
function parsePriceLocal(str){
  if(!str) return null;
  var s = str.replace(/,/g,'');
  var patterns = [
    [/\$([0-9.]+)/, 'USD'],
    [/£([0-9.]+)/, 'GBP'],
    [/¥([0-9.]+)/, 'CNY'],
    [/€([0-9.]+)|([0-9.]+)€/, 'EUR'],
    [/NT\$([0-9.]+)/, 'TWD'],
    [/NZ\$([0-9.]+)/, 'NZD'],
    [/A\$([0-9.]+)/, 'AUD'],
    [/([0-9.]+)엔/, 'JPY'],
    [/([0-9.]+)฿/, 'THB'],
    [/([0-9.]+)원/, 'KRW']
  ];
  for(var i=0;i<patterns.length;i++){
    var m = s.match(patterns[i][0]);
    if(m){
      var amt = m[1] || m[2];
      if(amt) return {amount: amt, currency: patterns[i][1]};
    }
  }
  return null;
}
var afCustomImage = null;
var afEditId = null;

function renderAddFormCats(){
  var wrap = document.getElementById('afCats');
  wrap.innerHTML = '';
  CATEGORIES.filter(function(c){ return c!=='ALL'; }).forEach(function(c){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'af-cat-chip' + (afSelectedCats.indexOf(c)!==-1 ? ' active' : '');
    btn.textContent = c;
    btn.onclick = function(){
      var i = afSelectedCats.indexOf(c);
      if(i===-1) afSelectedCats.push(c); else afSelectedCats.splice(i,1);
      renderAddFormCats();
    };
    wrap.appendChild(btn);
  });
}

function resetAddForm(){
  document.getElementById('afName').value = '';
  document.getElementById('afCountry').value = '';
  document.getElementById('afPhil').value = '';
  document.getElementById('afProducts').value = '';
  document.getElementById('afWebsite').value = '';
  document.getElementById('afInstagram').value = '';
  document.getElementById('afError').textContent = '';
  for(var i=0;i<3;i++){
    document.getElementById('bsName'+i).value = '';
    document.getElementById('bsAmount'+i).value = '';
    document.getElementById('bsCurrency'+i).value = 'KRW';
    document.getElementById('bsUrl'+i).value = '';
    document.getElementById('bsKrwPreview'+i).textContent = '';
  }
  afSelectedCats = [];
  afCustomImage = null;
  document.getElementById('afImgPreview').style.display = 'none';
  document.getElementById('afImgDropLabel').style.display = 'block';
  document.getElementById('afImgRemoveBtn').style.display = 'none';
  renderAddFormCats();
}

function setAddModalMode(editing){
  document.getElementById('addModalTitle').textContent = editing ? '브랜드 정보 수정' : '브랜드 추가';
  document.getElementById('afBtnSave').textContent = '저장';
  document.getElementById('afBtnList').style.display = editing ? 'none' : 'inline-block';
  document.getElementById('afBtnDiscard').textContent = editing ? '취소' : '삭제';
}

function openAddModal(){
  afEditId = null;
  resetAddForm();
  setAddModalMode(false);
  document.getElementById('addModalBg').classList.add('open');
}

function openEditModal(id){
  var b = getAllBrands().filter(function(x){ return x.id===id; })[0];
  if(!b) return;
  resetAddForm();
  afEditId = id;
  setAddModalMode(true);

  document.getElementById('afName').value = b.name;
  document.getElementById('afCountry').value = b.country;
  afSelectedCats = b.category.slice();
  document.getElementById('afPhil').value = b.philosophy;
  document.getElementById('afProducts').value = b.products.join(', ');
  document.getElementById('afWebsite').value = (b.website && b.website!=='#') ? b.website : '';
  document.getElementById('afInstagram').value = b.instagram || '';
  renderAddFormCats();

  var bs = b.bestSellers || [];
  for(var i=0;i<3;i++){
    document.getElementById('bsName'+i).value = bs[i] ? bs[i].name : '';
    document.getElementById('bsUrl'+i).value = bs[i] && bs[i].url ? bs[i].url : '';
    var parsed = bs[i] ? parsePriceLocal(bs[i].priceLocal) : null;
    document.getElementById('bsAmount'+i).value = parsed ? parsed.amount : '';
    document.getElementById('bsCurrency'+i).value = parsed ? parsed.currency : 'KRW';
    updateBsKrwPreview(i);
  }

  var entry = getEntry(id);
  var img = getImgSrc(b, entry);
  if(img){
    var preview = document.getElementById('afImgPreview');
    preview.src = img;
    preview.style.display = 'block';
    document.getElementById('afImgDropLabel').style.display = 'none';
    document.getElementById('afImgRemoveBtn').style.display = 'flex';
  }

  closeModal();
  document.getElementById('addModalBg').classList.add('open');
}

function closeAddModal(){
  document.getElementById('addModalBg').classList.remove('open');
  afEditId = null;
}

function submitAddBrand(mode){
  if(mode==='discard'){
    closeAddModal();
    return;
  }

  var name = document.getElementById('afName').value.trim();
  var errorEl = document.getElementById('afError');
  if(!name){
    errorEl.textContent = '브랜드명은 필수예요.';
    return;
  }
  var country = document.getElementById('afCountry').value.trim();
  var phil = document.getElementById('afPhil').value.trim();
  var productsRaw = document.getElementById('afProducts').value.trim();
  var website = document.getElementById('afWebsite').value.trim();
  var instagram = document.getElementById('afInstagram').value.trim();
  var productsArr = productsRaw ? productsRaw.split(',').map(function(p){ return p.trim(); }).filter(Boolean) : [];

  var existingBs = afEditId ? (getAllBrands().filter(function(x){ return x.id===afEditId; })[0] || {}).bestSellers || [] : [];

  var bestSellersArr = [];
  for(var i=0;i<3;i++){
    var bn = document.getElementById('bsName'+i).value.trim();
    var bAmt = document.getElementById('bsAmount'+i).value.trim();
    var bCur = document.getElementById('bsCurrency'+i).value;
    var bu = document.getElementById('bsUrl'+i).value.trim();
    if(!bn) continue;
    if(bAmt){
      bestSellersArr.push({
        name: bn,
        priceLocal: formatLocalPrice(bAmt, bCur),
        priceKRW: computeKrw(bAmt, bCur),
        url: bu || null
      });
    } else {
      var prev = existingBs[i];
      bestSellersArr.push({
        name: bn,
        priceLocal: prev ? prev.priceLocal : '가격 확인 필요',
        priceKRW: prev ? prev.priceKRW : null,
        url: bu || (prev ? prev.url : null)
      });
    }
  }

  if(afEditId){
    var existingBrand = getAllBrands().filter(function(x){ return x.id===afEditId; })[0] || {};
    var updatedBrand = Object.assign({}, existingBrand, {
      id: afEditId,
      name: name,
      country: country || '미상',
      category: afSelectedCats.length ? afSelectedCats.slice() : ['LIFESTYLE'],
      philosophy: phil || '(소개 문구 미입력)',
      products: productsArr,
      website: website || '#',
      instagram: instagram || null,
      bestSellers: bestSellersArr
    });
    var editIdx = -1;
    brands.forEach(function(b, i){ if(b.id===afEditId) editIdx = i; });
    if(editIdx===-1) brands.push(updatedBrand); else brands[editIdx] = updatedBrand;
    saveBrands(brands);

    if(afCustomImage){ setHeroImage(afEditId, afCustomImage); }

    closeAddModal();
    render();
    showToast('저장됐어요');
    return;
  }

  var id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Date.now();

  var brand = {
    id: id,
    name: name,
    country: country || '미상',
    category: afSelectedCats.length ? afSelectedCats.slice() : ['LIFESTYLE'],
    philosophy: phil || '(소개 문구 미입력)',
    website: website || '#',
    instagram: instagram || null,
    products: productsArr,
    bestSellers: bestSellersArr,
    scores: null,
    whyFits: null,
    potential: [],
    imageLabel: name.toUpperCase(),
    imgFile: 'images/' + id + '.jpg',
    sourceNote: '직접 입력한 브랜드',
    custom: true
  };

  brands.push(brand);
  saveBrands(brands);

  var entry = getEntry(id);
  if(mode==='saved') entry.status = 'saved';
  saveStore(store);
  if(afCustomImage) setHeroImage(id, afCustomImage);

  closeAddModal();
  render();
  showToast('추가됐어요');
}

function scoreTotal(s){ return s ? (s.wellness+s.space+s.visual+s.community+s.retail+s.collab) : null; }

function renderFilters(){
  var bar = document.getElementById('filterBar');
  bar.innerHTML = '';
  CATEGORIES.forEach(function(c){
    var btn = document.createElement('button');
    btn.className = 'chip' + (state.filter===c ? ' active' : '');
    btn.textContent = c;
    btn.onclick = function(){ state.filter = c; render(); };
    bar.appendChild(btn);
  });
}

function switchTab(tab){
  state.tab = tab;
  document.getElementById('tabDiscover').classList.toggle('active', tab==='discover');
  document.getElementById('tabSelected').classList.toggle('active', tab==='selected');
  document.getElementById('researchStub').style.display = tab==='discover' ? 'block' : 'none';
  render();
}

function statusLabel(st){
  if(st==='saved') return 'SAVED';
  if(st==='consider') return 'CONSIDER';
  if(st==='deleted') return 'DELETED';
  return '';
}

function render(){
  renderFilters();
  var grid = document.getElementById('cardGrid');
  grid.classList.toggle('list-view', state.view==='list');
  var empty = document.getElementById('emptyNote');
  grid.innerHTML = '';

  var list = getAllBrands().filter(function(b){
    var entry = getEntry(b.id);
    if(state.tab==='selected' && entry.status!=='saved') return false;
    if(state.filter!=='ALL' && b.category.indexOf(state.filter)===-1) return false;
    if(entry.status==='deleted' && !state.showDeleted) return false;
    return true;
  });

  list.sort(function(x, y){
    var ex = getEntry(x.id), ey = getEntry(y.id);
    var scoreX = (ex.status==='deleted' ? 0 : 2) + (hasReliableImage(x, ex) ? 1 : 0);
    var scoreY = (ey.status==='deleted' ? 0 : 2) + (hasReliableImage(y, ey) ? 1 : 0);
    return scoreY - scoreX;
  });

  var deletedCount = getAllBrands().filter(function(b){ return getEntry(b.id).status==='deleted'; }).length;
  var toggleEl = document.getElementById('deletedToggle');
  if(toggleEl){
    if(deletedCount===0){
      toggleEl.style.display = 'none';
    } else {
      toggleEl.style.display = 'block';
      toggleEl.textContent = state.showDeleted
        ? '삭제된 항목 숨기기 (' + deletedCount + ')'
        : '삭제된 항목 보기 (' + deletedCount + ')';
    }
  }

  empty.style.display = (state.tab==='selected' && list.length===0) ? 'block' : 'none';

  list.forEach(function(b){
    var entry = getEntry(b.id);
    var card = document.createElement('div');
    card.className = 'b-card';
    card.onclick = function(){ openModal(b.id); };
    var statusHtml = entry.status ? '<div class="b-status ' + entry.status + '">' + statusLabel(entry.status) + '</div>' : '<div></div>';
    var imgSrc = getImgSrc(b, entry);
    var removeBtnHtml = imgSrc ? '<button class="img-remove-btn" onclick="event.stopPropagation(); clearImage(\'' + b.id + '\')" title="이미지 삭제">×</button>' : '';
    card.innerHTML =
      '<div class="b-hero" data-brand-id="' + b.id + '">' +
        '<div class="hero-fallback">' +
          '<div class="mono-tag mono">' + b.country + '</div>' +
          '<div><div class="initial brand">' + b.name.charAt(0) + '</div></div>' +
        '</div>' +
        (imgSrc ? '<img class="hero-img" src="' + imgSrc + '" alt="' + b.name + '" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') +
        removeBtnHtml +
        '<div class="drop-hint">이미지를 드래그해서 ' + (imgSrc ? '변경' : '추가') + '하세요</div>' +
      '</div>' +
      '<div class="b-meta">' +
        '<div class="b-name">' + b.name + '</div>' +
        '<div class="b-cat mono">' + b.country + ' · ' + b.category.join(' · ') + '</div>' +
        '<div class="b-phil">' + b.philosophy + '</div>' +
        (b.bestSellers && b.bestSellers.length ? '<div class="b-best">Best: ' + b.bestSellers[0].name + '</div>' : '') +
        '<div class="b-foot">' +
          statusHtml +
        '</div>' +
      '</div>';
    grid.appendChild(card);
  });
}

function scoreRow(label, val, max){
  var pct = (val/max*100).toFixed(0);
  return '<div class="score-row">' +
    '<div class="k">' + label + '</div>' +
    '<div class="score-track"><div class="score-fill" style="width:' + pct + '%;"></div></div>' +
    '<div class="v">' + val + '/' + max + '</div>' +
  '</div>';
}

var currentModalId = null; /* which brand's detail modal is open, if any — lets realtime updates refresh it live */
function openModal(id){
  currentModalId = id;
  var b = getAllBrands().filter(function(x){ return x.id===id; })[0];
  if(!b){ closeModal(); return; } /* brand removed (e.g. by someone else) while this modal was open */
  var entry = getEntry(id);
  var m = document.getElementById('modalContent');

  var prodHtml = b.products.map(function(p){ return '<div class="prod-tag">' + p + '</div>'; }).join('');
  var potHtml = b.potential.length
    ? b.potential.map(function(p){ return '<div class="pot-tag">' + p + '</div>'; }).join('')
    : '<div class="pot-tag pending mono">평가 대기</div>';

  var instaHtml = b.instagram
    ? '<a href="' + b.instagram + '" target="_blank" rel="noopener">Instagram ↗</a>'
    : '<span class="mono" style="color:var(--stone-light); font-size:12px;">Instagram 확인 필요</span>';

  var reasons = ['Price','Visual mismatch','Product mismatch','Difficult to import','Too common','Weak brand identity','Not suitable for offline experience','Other'];
  var reasonsHtml = reasons.map(function(r){
    var active = entry.deleteReason===r ? ' active' : '';
    return '<button class="reason-chip' + active + '" onclick="setDeleteReason(\'' + id + '\',\'' + r + '\')">' + r + '</button>';
  }).join('');

  var modalImgSrc = getImgSrc(b, entry);
  var modalRemoveBtnHtml = modalImgSrc ? '<button class="img-remove-btn" onclick="clearImage(\'' + b.id + '\')" title="이미지 삭제">×</button>' : '';

  m.innerHTML =
    '<button class="modal-close" onclick="closeModal()">×</button>' +
    '<div class="modal-hero" data-brand-id="' + b.id + '"><div class="initial brand">' + b.name.charAt(0) + '</div>' +
      (modalImgSrc ? '<img class="hero-img" src="' + modalImgSrc + '" alt="' + b.name + '" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') +
      modalRemoveBtnHtml +
      '<div class="drop-hint">이미지를 드래그해서 ' + (modalImgSrc ? '변경' : '추가') + '하세요</div></div>' +
    '<div class="modal-body">' +
      '<div class="m-name">' + b.name + '</div>' +
      '<div class="m-meta mono">' + b.country + ' · ' + b.category.join(' · ') + '</div>' +
      '<div class="m-phil">' + b.philosophy + '</div>' +

      '<div class="m-section">' +
        '<div class="m-label">Representative Products</div>' +
        '<div class="prod-row">' + prodHtml + '</div>' +
      '</div>' +

      (b.bestSellers && b.bestSellers.length ?
      '<div class="m-section">' +
        '<div class="m-label">Best Sellers</div>' +
        '<div class="bs-list">' +
          b.bestSellers.map(function(item, idx){ return {item: item, idx: idx}; }).sort(function(a, c){
            var aHas = imageCache['bs:'+id+':'+a.idx] ? 1 : 0;
            var cHas = imageCache['bs:'+id+':'+c.idx] ? 1 : 0;
            return cHas - aHas;
          }).map(function(pair){
            var item = pair.item, idx = pair.idx;
            var priceHtml = item.priceKRW
              ? item.priceLocal + ' <span class="bs-krw">(' + item.priceKRW + ')</span>'
              : item.priceLocal;
            var bsImg = imageCache['bs:'+id+':'+idx] || null;
            var thumbInner = bsImg
              ? '<img class="bs-thumb-img" src="' + bsImg + '" alt="' + item.name + '">' +
                '<button class="bs-remove-btn" onclick="event.stopPropagation(); clearBsImage(\'' + id + '\',' + idx + ')" title="이미지 삭제">×</button>'
              : '<div class="bs-thumb-initial brand">' + b.name.charAt(0) + '</div>';
            var linkHtml = item.url
              ? '<a class="bs-link" href="' + item.url + '" target="_blank" rel="noopener">보기 ↗</a>'
              : '';
            return '<div class="bs-row">' +
              '<div class="bs-thumb" data-brand-id="' + id + '" data-bs-idx="' + idx + '">' + thumbInner + '</div>' +
              '<div class="bs-info">' +
                '<div class="bs-name">' + item.name + '</div>' +
                '<div class="bs-price">' + priceHtml + '</div>' +
              '</div>' +
              linkHtml +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' : '') +

      '<div class="m-section">' +
        '<div class="m-label">Potential at 333°</div>' +
        '<div class="potential-list">' + potHtml + '</div>' +
      '</div>' +

      '<div class="m-section">' +
        '<div class="m-label">Official Links</div>' +
        '<div class="link-row">' +
          '<a href="' + b.website + '" target="_blank" rel="noopener">Website ↗</a>' +
          instaHtml +
        '</div>' +
        '<div class="m-meta mono" style="margin-top:10px;">출처: ' + b.sourceNote + '</div>' +
      '</div>' +

      '<div class="m-section">' +
        '<div class="m-label">Comments</div>' +
        '<div class="comment-list" id="commentList">' + renderComments(entry) + '</div>' +
        '<div class="comment-form">' +
          '<input type="text" id="commentAuthor" placeholder="이름" value="' + (loadUsername()||'').replace(/"/g,'&quot;') + '">' +
          '<textarea id="commentText" placeholder="댓글을 남겨보세요"></textarea>' +
          '<button class="comment-submit" onclick="addComment(\'' + id + '\')">댓글 추가</button>' +
        '</div>' +
      '</div>' +

      '<div class="m-section">' +
        '<div class="m-label">Decision</div>' +
        '<div class="action-row">' +
          '<button class="act-btn save' + (entry.status==='saved'?' on':'') + '" onclick="setStatus(\'' + id + '\',\'saved\')">SAVE</button>' +
          '<button class="act-btn' + (entry.status==='consider'?' on':'') + '" onclick="setStatus(\'' + id + '\',\'consider\')">CONSIDER</button>' +
          '<button class="act-btn delete' + (entry.status==='deleted'?' on':'') + '" onclick="setStatus(\'' + id + '\',\'deleted\')">DELETE</button>' +
        '</div>' +
        '<div class="delete-reasons' + (entry.status==='deleted'?' show':'') + '" id="reasonRow">' + reasonsHtml + '</div>' +
        '<button class="edit-brand-btn" onclick="openEditModal(\'' + id + '\')">브랜드 정보 수정</button>' +
        (b.custom ? '<button class="remove-custom-btn" onclick="if(confirm(\'이 브랜드를 목록에서 완전히 삭제할까요?\')) removeCustomBrand(\'' + id + '\')">목록에서 완전히 삭제</button>' : '') +
      '</div>' +
    '</div>';

  document.getElementById('modalBg').classList.add('open');
}

function setStatus(id, status){
  var e = getEntry(id);
  e.status = (e.status===status) ? null : status;
  if(e.status!=='deleted') e.deleteReason = null;
  saveStore(store);
  openModal(id);
  render();
}
function setDeleteReason(id, reason){
  var e = getEntry(id);
  e.deleteReason = (e.deleteReason===reason) ? null : reason;
  saveStore(store);
  openModal(id);
}
function closeModal(){
  currentModalId = null;
  document.getElementById('modalBg').classList.remove('open');
}

/* Re-renders the open detail modal in place when its brand changed elsewhere
   (Supabase Realtime), without touching any comment draft the viewer is
   mid-typing. No-op if this modal isn't showing that brand, or isn't open. */
function refreshModalIfOpen(id){
  if(currentModalId !== id) return;
  var authorEl = document.getElementById('commentAuthor');
  var textEl = document.getElementById('commentText');
  var draftAuthor = authorEl ? authorEl.value : '';
  var draftText = textEl ? textEl.value : '';
  openModal(id);
  var newAuthorEl = document.getElementById('commentAuthor');
  var newTextEl = document.getElementById('commentText');
  if(newAuthorEl) newAuthorEl.value = draftAuthor;
  if(newTextEl) newTextEl.value = draftText;
}
function brandIdFromImageKey(key){
  if(key.indexOf('hero:')===0) return key.slice(5);
  if(key.indexOf('bs:')===0) return key.slice(3).split(':')[0];
  return null;
}

function resizeImageDataUrl(dataUrl, maxDim, quality, callback){
  var img = new Image();
  img.onload = function(){
    var w = img.width, h = img.height;
    var scale = Math.min(1, maxDim / Math.max(w, h));
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    try{
      callback(canvas.toDataURL('image/jpeg', quality));
    }catch(err){
      callback(dataUrl);
    }
  };
  img.onerror = function(){ callback(dataUrl); };
  img.src = dataUrl;
}

function extractImageFromDrop(e, callback){
  var file = e.dataTransfer.files && e.dataTransfer.files[0];
  if(file && file.type && file.type.indexOf('image/')===0){
    var reader = new FileReader();
    reader.onload = function(ev){
      resizeImageDataUrl(ev.target.result, 900, 0.8, callback);
    };
    reader.readAsDataURL(file);
    return;
  }

  var uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('URL') || e.dataTransfer.getData('text/plain');
  if(uri && /^https?:\/\//i.test(uri.trim())){
    callback(uri.trim());
    return;
  }

  var html = e.dataTransfer.getData('text/html');
  if(html){
    var m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if(m && m[1]){ callback(m[1]); return; }
  }

  callback(null);
}

function handleDropEvent(e, brandId, onDone){
  extractImageFromDrop(e, function(result){
    if(!result){
      alert('이미지를 인식하지 못했어요. 이미지를 컴퓨터에 저장한 뒤 다시 드래그해보시거나, 다른 이미지로 시도해주세요.');
      return;
    }
    setHeroImage(brandId, result);
    if(onDone) onDone();
  });
}

(function setupDragDrop(){
  var grid = document.getElementById('cardGrid');
  grid.addEventListener('dragover', function(e){
    var hero = e.target.closest('.b-hero');
    if(hero){ e.preventDefault(); hero.classList.add('drag-over'); }
  });
  grid.addEventListener('dragleave', function(e){
    var hero = e.target.closest('.b-hero');
    if(hero) hero.classList.remove('drag-over');
  });
  grid.addEventListener('drop', function(e){
    var hero = e.target.closest('.b-hero');
    if(!hero) return;
    e.preventDefault(); e.stopPropagation();
    hero.classList.remove('drag-over');
    var id = hero.getAttribute('data-brand-id');
    handleDropEvent(e, id, render);
  });

  var modalBg = document.getElementById('modalBg');
  modalBg.addEventListener('dragover', function(e){
    var hero = e.target.closest('.modal-hero');
    var thumb = e.target.closest('.bs-thumb');
    if(hero){ e.preventDefault(); hero.classList.add('drag-over'); }
    else if(thumb){ e.preventDefault(); thumb.classList.add('drag-over'); }
  });
  modalBg.addEventListener('dragleave', function(e){
    var hero = e.target.closest('.modal-hero');
    var thumb = e.target.closest('.bs-thumb');
    if(hero) hero.classList.remove('drag-over');
    if(thumb) thumb.classList.remove('drag-over');
  });
  modalBg.addEventListener('drop', function(e){
    var hero = e.target.closest('.modal-hero');
    var thumb = e.target.closest('.bs-thumb');
    if(hero){
      e.preventDefault(); e.stopPropagation();
      hero.classList.remove('drag-over');
      var id = hero.getAttribute('data-brand-id');
      handleDropEvent(e, id, function(){ openModal(id); render(); });
      return;
    }
    if(thumb){
      e.preventDefault(); e.stopPropagation();
      thumb.classList.remove('drag-over');
      var bId = thumb.getAttribute('data-brand-id');
      var idx = thumb.getAttribute('data-bs-idx');
      extractImageFromDrop(e, function(result){
        if(!result){
          alert('이미지를 인식하지 못했어요. 다른 이미지로 시도해보세요.');
          return;
        }
        setBsImage(bId, idx, result);
        openModal(bId);
      });
    }
  });

  var afDrop = document.getElementById('afImgDrop');
  afDrop.addEventListener('dragover', function(e){ e.preventDefault(); afDrop.classList.add('drag-over'); });
  afDrop.addEventListener('dragleave', function(){ afDrop.classList.remove('drag-over'); });
  afDrop.addEventListener('drop', function(e){
    e.preventDefault(); e.stopPropagation();
    afDrop.classList.remove('drag-over');
    extractImageFromDrop(e, function(result){
      if(!result){
        alert('이미지를 인식하지 못했어요. 다른 이미지로 시도해보세요.');
        return;
      }
      afCustomImage = result;
      var preview = document.getElementById('afImgPreview');
      preview.src = result;
      preview.style.display = 'block';
      document.getElementById('afImgDropLabel').style.display = 'none';
      document.getElementById('afImgRemoveBtn').style.display = 'flex';
    });
  });
})();

function clearAddFormImage(){
  afCustomImage = null;
  document.getElementById('afImgPreview').style.display = 'none';
  document.getElementById('afImgDropLabel').style.display = 'block';
  document.getElementById('afImgRemoveBtn').style.display = 'none';
}

function exportData(){
  idbGetAll().then(function(images){
    var bundle = {
      version: 3,
      exportedAt: new Date().toISOString(),
      store: store,
      brands: brands,
      images: images
    };
    var blob = new Blob([JSON.stringify(bundle, null, 2)], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '333-marketplace-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }).catch(function(){
    alert('이미지 데이터를 불러오지 못해 내보내기에 실패했어요.');
  });
}

function importData(event){
  var file = event.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    var bundle;
    try{
      bundle = JSON.parse(e.target.result);
    }catch(err){
      alert('파일을 읽지 못했어요. 올바른 내보내기 파일인지 확인해주세요.');
      return;
    }
    if(bundle.store){
      Object.keys(bundle.store).forEach(function(id){
        var incoming = bundle.store[id];
        var local = store[id];
        if(!local){
          store[id] = incoming;
          return;
        }
        /* keep local judgment (status/deleteReason) if already set, else take incoming */
        if(!local.status && incoming.status) local.status = incoming.status;
        if(!local.deleteReason && incoming.deleteReason) local.deleteReason = incoming.deleteReason;
        /* merge comments: combine both lists, dedupe by author+text+ts */
        var localComments = local.comments || [];
        var incomingComments = incoming.comments || [];
        var seen = {};
        localComments.forEach(function(c){ seen[c.author+'|'+c.text+'|'+c.ts] = true; });
        incomingComments.forEach(function(c){
          var key = c.author+'|'+c.text+'|'+c.ts;
          if(!seen[key]){ localComments.push(c); seen[key] = true; }
        });
        local.comments = localComments;
      });
      saveStore(store);
    }
    if(bundle.brands){
      /* current export format: one flat brands array, already fully merged */
      var existingIds = brands.map(function(b){ return b.id; });
      bundle.brands.forEach(function(b){
        if(existingIds.indexOf(b.id)===-1) brands.push(b);
      });
      saveBrands(brands);
    }else if(bundle.customBrands || bundle.overrides){
      /* backward-compat: pre-unification export format (separate customBrands + overrides) */
      if(bundle.customBrands){
        var existingIds2 = brands.map(function(b){ return b.id; });
        bundle.customBrands.forEach(function(b){
          if(existingIds2.indexOf(b.id)===-1) brands.push(b);
        });
      }
      if(bundle.overrides){
        Object.keys(bundle.overrides).forEach(function(id){
          var idx = -1;
          brands.forEach(function(b, i){ if(b.id===id) idx = i; });
          if(idx!==-1) brands[idx] = Object.assign({}, brands[idx], bundle.overrides[id]);
        });
      }
      saveBrands(brands);
    }
    var imgKeys = bundle.images ? Object.keys(bundle.images) : [];
    Promise.all(imgKeys.map(function(k){
      imageCache[k] = bundle.images[k];
      return idbSet(k, bundle.images[k]);
    })).then(function(){
      event.target.value = '';
      render();
      alert('가져오기 완료! 이미지와 저장 상태가 복원됐어요.');
    }).catch(function(){
      event.target.value = '';
      render();
      alert('가져오기는 됐지만 일부 이미지 저장에 실패했어요.');
    });
  };
  reader.readAsText(file);
}

renderAddFormCats();

/* ---- Supabase sync (replaces Firestore) ----
   Same overall shape as before (in-memory store/brands/imageCache, whole-object
   saveXxx() calls from the rest of this file), but the DB is normalized to one row
   per brand/image instead of one giant blob per collection, so saving only writes the
   rows that actually changed (two people editing different brands at the same time no
   longer clobber each other), and changes made by anyone else viewing the page arrive
   over Supabase Realtime instead of a Firestore onSnapshot listener. There's no more
   hardcoded seed array either — 'brands' starts empty and is populated entirely from
   the 'brands' table on load. */
function supa(){ return window.__supabase; }
function throwIfError(res){ if(res && res.error) throw res.error; return res; }

/* brand_entries row <-> store[id] shape */
function entryRowToJs(row){
  return {
    status: row.status || null,
    deleteReason: row.delete_reason || null,
    comments: row.comments || [],
    imageCleared: !!row.image_cleared,
    customImage: row.custom_image || null
  };
}
function entryJsToRow(id, e){
  return {
    id: id,
    status: e.status || null,
    delete_reason: e.deleteReason || null,
    comments: e.comments || [],
    image_cleared: !!e.imageCleared,
    custom_image: e.customImage || null
  };
}

var syncedEntries = {}; /* id -> JSON of last-known-saved brand_entries row */
var syncedBrands = {};  /* id -> JSON of last-known-saved brands.data */

function syncBrandEntries(s){
  var prevIds = Object.keys(syncedEntries);
  var nextIds = Object.keys(s);
  var upserts = [];
  nextIds.forEach(function(id){
    var row = entryJsToRow(id, s[id]);
    var json = JSON.stringify(row);
    if(syncedEntries[id] !== json){ upserts.push(row); }
  });
  var removedIds = prevIds.filter(function(id){ return nextIds.indexOf(id)===-1; });
  var ops = [];
  if(upserts.length) ops.push(supa().from('brand_entries').upsert(upserts));
  removedIds.forEach(function(id){ ops.push(supa().from('brand_entries').delete().eq('id', id)); });
  Promise.all(ops).then(function(results){
    if(results.some(function(r){ return r.error; })) throw new Error('save failed');
    upserts.forEach(function(row){ syncedEntries[row.id] = JSON.stringify(row); });
    removedIds.forEach(function(id){ delete syncedEntries[id]; });
  }).catch(function(){
    alert('저장에 실패했어요 (인터넷 연결을 확인해주세요).');
  });
}

function syncBrands(list){
  var prevIds = Object.keys(syncedBrands);
  var nextIds = list.map(function(b){ return b.id; });
  var upserts = [];
  list.forEach(function(b){
    var json = JSON.stringify(b);
    if(syncedBrands[b.id] !== json){ upserts.push({id:b.id, data:b}); }
  });
  var removedIds = prevIds.filter(function(id){ return nextIds.indexOf(id)===-1; });
  var ops = [];
  if(upserts.length) ops.push(supa().from('brands').upsert(upserts));
  removedIds.forEach(function(id){ ops.push(supa().from('brands').delete().eq('id', id)); });
  Promise.all(ops).then(function(results){
    if(results.some(function(r){ return r.error; })) throw new Error('save failed');
    upserts.forEach(function(row){ syncedBrands[row.id] = JSON.stringify(row.data); });
    removedIds.forEach(function(id){ delete syncedBrands[id]; });
  }).catch(function(){
    alert('저장에 실패했어요 (인터넷 연결을 확인해주세요).');
  });
}

/* Guards against this whole script running more than once concurrently.
   It's re-injected as a fresh <script> on every mount of MarketplacePage, and
   React 19 StrictMode (dev only) mounts effects twice, so a second copy of
   this script — with its own in-flight loadAll() fetch and realtime channel —
   can briefly overlap with the previous one. Without this, the stale copy's
   fetch/events can resolve after the new one and stomp store/brands/imageCache
   with outdated data. Every async callback below checks
   isCurrentSyncGen() before touching shared state, so a stale instance's
   leftover work becomes a no-op instead of a race.

   mySyncGen has to live in this IIFE's closure, not as a top-level `var` —
   this whole file runs as one global <script>, so a top-level `var` would be
   the same window property for every instance, and a later instance's copy
   would silently overwrite the value earlier instances' closures read. */
(function(){
window.__marketplaceSyncGen = (window.__marketplaceSyncGen || 0) + 1;
var mySyncGen = window.__marketplaceSyncGen;
function isCurrentSyncGen(){ return window.__marketplaceSyncGen === mySyncGen; }

function initSupabaseSync(){
  var sb = supa();

  function loadAll(){
    return Promise.all([
      sb.from('brand_entries').select('*'),
      sb.from('brands').select('*'),
      sb.from('brand_images').select('*')
    ]).then(function(results){
      if(!isCurrentSyncGen()) return;
      results.forEach(throwIfError);
      var entriesRes = results[0], brandsRes = results[1], imagesRes = results[2];

      store = {};
      syncedEntries = {};
      entriesRes.data.forEach(function(row){
        store[row.id] = entryRowToJs(row);
        syncedEntries[row.id] = JSON.stringify(entryJsToRow(row.id, store[row.id]));
      });

      brands = [];
      syncedBrands = {};
      brandsRes.data.forEach(function(row){
        brands.push(row.data);
        syncedBrands[row.id] = JSON.stringify(row.data);
      });

      imageCache = {};
      imagesRes.data.forEach(function(row){ imageCache[row.id] = imagePublicUrl(row.id, row.updated_at); });

      render();
    }).catch(function(err){ console.error('initial load error', err); });
  }

  loadAll();

  var channel = sb.channel('marketplace-sync-' + mySyncGen)
    .on('postgres_changes', {event:'*', schema:'public', table:'brand_entries'}, function(payload){
      if(!isCurrentSyncGen()) return;
      var id = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id;
      if(payload.eventType === 'DELETE'){
        delete store[id];
        delete syncedEntries[id];
      }else{
        var row = payload.new;
        store[row.id] = entryRowToJs(row);
        syncedEntries[row.id] = JSON.stringify(entryJsToRow(row.id, store[row.id]));
      }
      render();
      refreshModalIfOpen(id);
    })
    .on('postgres_changes', {event:'*', schema:'public', table:'brands'}, function(payload){
      if(!isCurrentSyncGen()) return;
      var id = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id;
      if(payload.eventType === 'DELETE'){
        brands = brands.filter(function(b){ return b.id !== id; });
        delete syncedBrands[id];
      }else{
        var idx = -1;
        brands.forEach(function(b, i){ if(b.id === payload.new.id) idx = i; });
        if(idx===-1) brands.push(payload.new.data); else brands[idx] = payload.new.data;
        syncedBrands[payload.new.id] = JSON.stringify(payload.new.data);
      }
      render();
      refreshModalIfOpen(id);
    })
    .on('postgres_changes', {event:'*', schema:'public', table:'brand_images'}, function(payload){
      if(!isCurrentSyncGen()) return;
      var key = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id;
      if(payload.eventType === 'DELETE'){ delete imageCache[key]; }
      else{ imageCache[key] = imagePublicUrl(payload.new.id, payload.new.updated_at); }
      render();
      var brandId = brandIdFromImageKey(key);
      if(brandId) refreshModalIfOpen(brandId);
    })
    .subscribe();

  window.__marketplaceCleanup = function(){
    sb.removeChannel(channel);
  };
}

initSupabaseSync();
render();
})();
