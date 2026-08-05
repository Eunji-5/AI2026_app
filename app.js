document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let allFacilities = window.FACILITIES_DATA || [];
  let filteredFacilities = [...allFacilities];
  let map = null;
  let markerClusterGroup = null;
  let activeMarker = null;
  let activeFacility = null;
  let markerMap = new Map(); // id -> L.marker
  let currentFilterType = 'all'; // 필터 상태: all | 초등학교 | 유치원 | 어린이집 | danger | safe

  // Init App
  initMap();
  initStats();
  initEvents();

  // 1. Initialize Free OpenStreetMap via Leaflet
  function initMap() {
    // Center of South Korea (e.g. around Daejeon/Seoul)
    map = L.map('map', {
      center: [36.5, 127.8],
      zoom: 7,
      minZoom: 6,
      maxZoom: 18,
      zoomControl: false
    });

    // Add Zoom Control on Top-Right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Free OpenStreetMap Tile Layer (Zero API Key required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | 전국어린이보호구역표준데이터'
    }).addTo(map);

    // Initialize Marker Cluster Group (Disable chunkedLoading for instant marker updates)
    markerClusterGroup = L.markerClusterGroup({
      chunkedLoading: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function (cluster) {
        const childCount = cluster.getChildCount();
        let c = ' marker-cluster-';
        if (childCount < 20) c += 'small';
        else if (childCount < 100) c += 'medium';
        else c += 'large';

        return new L.DivIcon({
          html: `<div><span>${childCount}</span></div>`,
          className: 'marker-cluster' + c,
          iconSize: new L.Point(40, 40)
        });
      }
    });

    map.addLayer(markerClusterGroup);

    // Render Markers
    renderMarkers(filteredFacilities);

    // Fly to Gyeonggi/Seoul area by default for better initial view
    map.flyTo([37.3, 127.2], 10, { duration: 1.5 });
  }

  // 2. Render Markers into MarkerCluster
  function renderMarkers(dataList) {
    markerClusterGroup.clearLayers();
    markerMap.clear();

    const markers = [];

    dataList.forEach(fac => {
      let subBadgeIcon = '🟢';
      if (fac.grade === 1) subBadgeIcon = '💚';
      else if (fac.grade === 2) subBadgeIcon = '🟢';
      else if (fac.grade === 3) subBadgeIcon = '🟡';
      else if (fac.grade === 4) subBadgeIcon = '🟠';
      else if (fac.grade === 5) subBadgeIcon = '🚨';

      // Accurate Icon Determination
      let displayIcon = fac.icon || '🎒';
      if (fac.name.includes('유치원') || fac.type.includes('유치원') || fac.name.includes('병설')) {
        displayIcon = '🐥';
      } else if (fac.name.includes('어린이집') || fac.type.includes('어린이집')) {
        displayIcon = '👶';
      } else if (fac.name.includes('초등학교') || fac.type.includes('초등학교')) {
        displayIcon = '🏫';
      }

      // Create Custom DivIcon
      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker-wrapper',
        html: `
          <div class="custom-leaflet-marker-container">
            <div class="custom-leaflet-marker marker-grade-${fac.grade}">
              <span class="marker-icon-inner">${displayIcon}</span>
              <span class="marker-grade-badge">${subBadgeIcon}</span>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([fac.lat, fac.lng], { icon: customIcon });

      // Click Event
      marker.on('click', () => {
        openDetailModal(fac);
      });

      markerMap.set(fac.id, marker);
      markers.push(marker);
    });

    markerClusterGroup.addLayers(markers);

    // Update Stats Badge
    updateStats(dataList);
  }

  // 3. Stats Update
  function initStats() {
    const totalEl = document.getElementById('stat-total-count');
    const avgEl = document.getElementById('stat-avg-score');

    if (totalEl) totalEl.textContent = `${allFacilities.length.toLocaleString()} 개`;
    
    if (allFacilities.length > 0) {
      const sum = allFacilities.reduce((acc, cur) => acc + cur.score, 0);
      const avg = (sum / allFacilities.length).toFixed(1);
      if (avgEl) avgEl.textContent = `${avg} 점`;
    }
  }

  function updateStats(dataList) {
    const totalEl = document.getElementById('stat-total-count');
    const avgEl = document.getElementById('stat-avg-score');

    if (totalEl) totalEl.textContent = `${dataList.length.toLocaleString()} 개`;

    if (dataList.length > 0) {
      const sum = dataList.reduce((acc, cur) => acc + cur.score, 0);
      const avg = (sum / dataList.length).toFixed(1);
      if (avgEl) avgEl.textContent = `${avg} 점`;
    } else {
      if (avgEl) avgEl.textContent = `0 점`;
    }
  }

  // 4. Detail Modal Popup (Bottom Sheet)
  function openDetailModal(fac) {
    activeFacility = fac;

    const modal = document.getElementById('detail-modal');
    const typeBadge = document.getElementById('modal-type-badge');
    const titleEl = document.getElementById('modal-title');
    const scoreValEl = document.getElementById('modal-score-val');
    const gradeBadge = document.getElementById('modal-grade-badge');
    const addressEl = document.getElementById('modal-address');

    // Breakdown elements
    const cctvText = document.getElementById('modal-cctv-text');
    const cctvBar = document.getElementById('modal-cctv-bar');
    const roadText = document.getElementById('modal-road-text');
    const roadBar = document.getElementById('modal-road-bar');
    const policeText = document.getElementById('modal-police-text');
    const policeBar = document.getElementById('modal-police-bar');

    if (typeBadge) typeBadge.textContent = `${fac.icon} ${fac.type}`;
    if (titleEl) titleEl.textContent = fac.name;
    if (scoreValEl) scoreValEl.textContent = fac.score;
    if (addressEl) addressEl.textContent = fac.address || '주소 정보 미기재';

    // Grade Badge
    let gradeIcon = '🟢';
    if (fac.grade === 3) gradeIcon = '🟡';
    else if (fac.grade === 4) gradeIcon = '🟠';
    else if (fac.grade === 5) gradeIcon = '🔴';

    if (gradeBadge) {
      gradeBadge.textContent = `${gradeIcon} ${fac.grade}등급 (${fac.gradeText})`;
      gradeBadge.style.backgroundColor = fac.badgeColor;
    }

    // Breakdown Details
    const cctvExistScore = fac.cctvExist ? 20 : 0;
    const cctvCountScore = Math.min(30, fac.cctvCount * 10);
    const cctvTotal = cctvExistScore + cctvCountScore;

    if (cctvText) cctvText.textContent = `${fac.cctvExist ? '설치됨 (Y)' : '미설치 (N)'} · ${fac.cctvCount}대 (${cctvTotal}/50점)`;
    if (cctvBar) cctvBar.style.width = `${(cctvTotal / 50) * 100}%`;

    let roadScore = fac.roadWidth >= 12 ? 30 : (fac.roadWidth >= 8 ? 20 : 10);
    if (roadText) roadText.textContent = `폭 ${fac.roadWidth}m (${roadScore}/30점)`;
    if (roadBar) roadBar.style.width = `${(roadScore / 30) * 100}%`;

    let policeScore = fac.police ? 20 : 10;
    if (policeText) policeText.textContent = `${fac.police || '관할 정보 미기재'} (${policeScore}/20점)`;
    if (policeBar) policeBar.style.width = `${(policeScore / 20) * 100}%`;

    modal.classList.add('active');

    // Pan map to location
    map.panTo([fac.lat, fac.lng], { animate: true });
  }

  function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.remove('active');
  }

  // 5. Search & Filters
  function initEvents() {
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const searchDropdown = document.getElementById('search-dropdown');
    const myLocationBtn = document.getElementById('btn-my-location');
    const closeBtn = document.getElementById('modal-close-btn');
    const recenterBtn = document.getElementById('btn-recenter');
    const shareBtn = document.getElementById('btn-share');

    // GPS My Location Click (No Server Storage - 100% Privacy Compliant)
    if (myLocationBtn) {
      myLocationBtn.addEventListener('click', () => {
        if ('geolocation' in navigator) {
          myLocationBtn.textContent = '🔄 위치 찾는 중...';
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              myLocationBtn.textContent = '🎯 내 위치';
              const { latitude, longitude } = pos.coords;
              map.flyTo([latitude, longitude], 15, { duration: 1.5 });

              // Temporary Leaflet popup for current location
              L.popup()
                .setLatLng([latitude, longitude])
                .setContent(`
                  <div style="text-align:center; padding: 4px;">
                    <div style="font-weight: 800; font-size: 14px; color: #3b82f6;">📍 현재 보호자님 위치</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">(위치 데이터는 서버에 절대 저장되지 않습니다)</div>
                  </div>
                `)
                .openOn(map);
            },
            (err) => {
              myLocationBtn.textContent = '🎯 내 위치';
              alert('현재 위치 정보를 가져올 수 없습니다. 브라우저 위치 접근 권한을 확인해 주세요.');
            },
            { timeout: 10000, enableHighAccuracy: true }
          );
        } else {
          alert('현재 브라우저에서는 위치 서비스를 지원하지 않습니다.');
        }
      });
    }

    // Close detail modal
    if (closeBtn) closeBtn.addEventListener('click', closeDetailModal);
    const dragHandle = document.querySelector('.modal-drag-handle');
    if (dragHandle) dragHandle.addEventListener('click', closeDetailModal);
    if (map) map.on('click', closeDetailModal);

    // Recenter
    if (recenterBtn) {
      recenterBtn.addEventListener('click', () => {
        if (activeFacility) {
          map.flyTo([activeFacility.lat, activeFacility.lng], 16, { duration: 1.2 });
        }
      });
    }

    // Share link
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (activeFacility) {
          const shareText = `[세이프스코어 키즈] ${activeFacility.name} (안전지수: ${activeFacility.score}점 - ${activeFacility.gradeText})\n주소: ${activeFacility.address}`;
          navigator.clipboard.writeText(shareText).then(() => {
            alert('시설 안전지수 정보가 클립보드에 복사되었습니다! 원하는 곳에 공유해보세요.');
          }).catch(() => {
            alert(shareText);
          });
        }
      });
    }

    // Search Input Autocomplete, Region Search & Camera Flying
    const searchIcon = document.querySelector('.search-icon');
    if (searchIcon) {
      searchIcon.style.cursor = 'pointer';
      searchIcon.addEventListener('click', () => {
        const val = searchInput ? searchInput.value.trim().toLowerCase() : '';
        if (val.length > 0) {
          if (searchDropdown) searchDropdown.style.display = 'none';
          const matches = filteredFacilities.filter(f =>
            f.name.toLowerCase().includes(val) || f.address.toLowerCase().includes(val)
          );
          flyToMatchingRegion(matches, val);
        }
      });
    }

    if (searchInput) {
      // Show Quick Region Tags on Focus
      searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length === 0) {
          showQuickRegionSuggestions();
        }
      });

      // Realtime Filtering on Input
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        updateFilteredData();
        if (val.length > 0) {
          if (searchClearBtn) searchClearBtn.style.display = 'flex';
          showSearchSuggestions(val);
        } else {
          if (searchClearBtn) searchClearBtn.style.display = 'none';
          showQuickRegionSuggestions();
        }
      });

      // Enter Key & Escape Key Handling
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = searchInput.value.trim().toLowerCase();
          if (val.length > 0) {
            if (searchDropdown) searchDropdown.style.display = 'none';
            const matches = filteredFacilities.filter(f =>
              f.name.toLowerCase().includes(val) || f.address.toLowerCase().includes(val)
            );
            flyToMatchingRegion(matches, val);
          }
        } else if (e.key === 'Escape') {
          searchInput.value = '';
          if (searchClearBtn) searchClearBtn.style.display = 'none';
          if (searchDropdown) searchDropdown.style.display = 'none';
          updateFilteredData();
          showToast('🧹 검색어가 삭제되었습니다.');
        }
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        if (searchClearBtn) searchClearBtn.style.display = 'none';
        if (searchDropdown) searchDropdown.style.display = 'none';
        updateFilteredData();
        showToast('🧹 검색어가 지워졌습니다.');
      });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box-wrapper')) {
        if (searchDropdown) searchDropdown.style.display = 'none';
      }
    });

    // Filter Chips Event
    const chipBtns = document.querySelectorAll('.chip-btn');
    chipBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        chipBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filterType = btn.getAttribute('data-filter');
        applyFilter(filterType);
      });
    });

    // Ranking Modal Events
    const rankingBtn = document.getElementById('btn-open-ranking');
    const rankingModal = document.getElementById('ranking-modal');
    const rankingCloseBtn = document.getElementById('ranking-close-btn');

    if (rankingBtn) {
      rankingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRankingModal('high');
      });
    }

    if (rankingCloseBtn) {
      rankingCloseBtn.addEventListener('click', () => {
        if (rankingModal) rankingModal.classList.remove('active');
      });
    }

    if (rankingModal) {
      rankingModal.addEventListener('click', (e) => {
        if (e.target === rankingModal) {
          rankingModal.classList.remove('active');
        }
      });
    }

    // Ranking Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        tabBtns.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const rankType = tab.getAttribute('data-rank-type');
        renderRankingList(rankType);
      });
    });

    // PRD Download & Modal Events
    const prdDirectBtn = document.getElementById('btn-download-prd-direct');
    const prdModalBtn = document.getElementById('btn-download-prd-modal');
    const prdBtn = document.getElementById('btn-open-prd');
    const prdModal = document.getElementById('prd-modal');
    const prdCloseBtn = document.getElementById('prd-close-btn');
    const copyPrdBtn = document.getElementById('btn-copy-prd');

    if (prdDirectBtn) {
      prdDirectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadPrdFile();
      });
    }

    if (prdModalBtn) {
      prdModalBtn.addEventListener('click', downloadPrdFile);
    }

    if (prdBtn) {
      prdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPrdModal();
      });
    }

    if (prdCloseBtn) {
      prdCloseBtn.addEventListener('click', () => {
        if (prdModal) prdModal.classList.remove('active');
      });
    }

    if (prdModal) {
      prdModal.addEventListener('click', (e) => {
        if (e.target === prdModal) {
          prdModal.classList.remove('active');
        }
      });
    }

    if (copyPrdBtn) {
      copyPrdBtn.addEventListener('click', () => {
        const contentEl = document.getElementById('prd-content');
        if (contentEl) {
          navigator.clipboard.writeText(contentEl.textContent).then(() => {
            alert('PRD 전체 텍스트가 클립보드에 복사되었습니다!');
          }).catch(err => {
            alert('복사 실패: ' + err);
          });
        }
      });
    }
  }

  // PRD File Download Logic (100% Offline & File Protocol Compatible)
  function downloadPrdFile() {
    const text = window.PRD_TEXT || '';
    if (!text) {
      alert('PRD 데이터를 로드할 수 없습니다.');
      return;
    }

    try {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'SafeScore_Kids_PRD.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
} catch (e) {
      alert('다운로드 중 오류가 발생했습니다: ' + e.message);
    }
  }

  // Markdown to HTML renderer for PRD Viewer
  function parseMarkdownToHTML(markdownText) {
    if (!markdownText) return '';
    let html = markdownText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="prd-code-block"><code>$1</code></pre>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="prd-h3">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="prd-h2">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="prd-h1">$1</h1>');

    // Horizontal rule
    html = html.replace(/^---$/gim, '<hr class="prd-hr">');

    // Bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points
    html = html.replace(/^\* (.*$)/gim, '<li class="prd-li">$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li class="prd-li">$1</li>');

    // Simple Table Parsing
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    let resultLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.includes(':---') || line.includes('---:')) {
          continue;
        }
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (!inTable) {
          inTable = true;
          tableHtml = '<table class="prd-table"><thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</tbody></table>';
          resultLines.push(tableHtml);
          tableHtml = '';
        }
        resultLines.push(line);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table>';
      resultLines.push(tableHtml);
    }

    return resultLines.join('\n').replace(/\n\n/g, '<br>');
  }

  // Display PRD file content
  function openPrdModal() {
    const prdModal = document.getElementById('prd-modal');
    const contentEl = document.getElementById('prd-content');

    if (prdModal) prdModal.classList.add('active');

    const prdText = window.PRD_TEXT || '📄 PRD 문서 데이터를 불러올 수 없습니다.';
    if (contentEl) {
      contentEl.innerHTML = parseMarkdownToHTML(prdText);
    }
  }

  // Fly map camera to region/bounds matching searched facilities
  function flyToMatchingRegion(matches, queryText = '') {
    if (!map) return;

    if (!matches || matches.length === 0) {
      showToast(`⚠️ '${queryText}' 검색 결과가 없습니다.`);
      return;
    }

    if (matches.length === 1) {
      map.flyTo([matches[0].lat, matches[0].lng], 16, { duration: 1.5 });
      openDetailModal(matches[0]);
      showToast(`📍 ${matches[0].name} 위치로 이동했습니다.`);
    } else {
      const lats = matches.map(m => m.lat);
      const lngs = matches.map(m => m.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      map.flyToBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50], maxZoom: 15, duration: 1.5 });
      showToast(`📍 검색한 ${matches.length.toLocaleString()}개 장소 지역으로 이동했습니다.`);
    }
  }

  // Show Quick Popular Region Search Tags on Focus
  function showQuickRegionSuggestions() {
    const searchDropdown = document.getElementById('search-dropdown');
    if (!searchDropdown) return;

    searchDropdown.innerHTML = `
      <div style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="font-size: 11.5px; color: #94a3b8; font-weight: 700; margin-bottom: 8px;">⚡ 인기 지역 빠른 검색</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          <button class="quick-tag-btn" data-region="서울">📍 서울</button>
          <button class="quick-tag-btn" data-region="경기">📍 경기</button>
          <button class="quick-tag-btn" data-region="이천">📍 이천시</button>
          <button class="quick-tag-btn" data-region="수원">📍 수원시</button>
          <button class="quick-tag-btn" data-region="인천">📍 인천</button>
          <button class="quick-tag-btn" data-region="부산">📍 부산</button>
          <button class="quick-tag-btn" data-region="대구">📍 대구</button>
          <button class="quick-tag-btn" data-region="대전">📍 대전</button>
        </div>
      </div>
      <div style="padding: 10px 14px; font-size: 11.5px; color: #64748b;">
        🔍 검색어를 입력하거나 지역 태그를 누르면 해당 지역으로 이동합니다.
      </div>
    `;

    const tagBtns = searchDropdown.querySelectorAll('.quick-tag-btn');
    tagBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const region = btn.getAttribute('data-region');
        const searchInput = document.getElementById('search-input');
        const searchClearBtn = document.getElementById('search-clear-btn');
        if (searchInput) {
          searchInput.value = region;
          if (searchClearBtn) searchClearBtn.style.display = 'block';
        }
        updateFilteredData();
        showSearchSuggestions(region.toLowerCase());

        const matches = filteredFacilities.filter(f =>
          f.name.toLowerCase().includes(region.toLowerCase()) || f.address.toLowerCase().includes(region.toLowerCase())
        );
        flyToMatchingRegion(matches);
      });
    });

    searchDropdown.style.display = 'block';
  }

  // Search Suggestions Renderer
  function showSearchSuggestions(query) {
    const searchDropdown = document.getElementById('search-dropdown');
    if (!searchDropdown) return;
    searchDropdown.innerHTML = '';

    const matches = filteredFacilities.filter(f => 
      f.name.toLowerCase().includes(query) || f.address.toLowerCase().includes(query)
    ).slice(0, 8);

    if (matches.length === 0) {
      searchDropdown.innerHTML = `<div style="padding: 14px; text-align: center; color: #94a3b8; font-size: 13px;">현재 선택한 카테고리에서 일치하는 시설을 찾을 수 없습니다.</div>`;
    } else {
      matches.forEach(fac => {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `
          <div class="search-item-info">
            <div class="search-item-title">${fac.icon} ${fac.name}</div>
            <div class="search-item-addr">${fac.address}</div>
          </div>
          <div class="search-item-badge" style="background-color: ${fac.badgeColor}">
            ${fac.score}점
          </div>
        `;

        item.addEventListener('click', () => {
          searchDropdown.style.display = 'none';
          map.flyTo([fac.lat, fac.lng], 16, { duration: 1.5 });
          openDetailModal(fac);
        });

        searchDropdown.appendChild(item);
      });
    }

    searchDropdown.style.display = 'block';
  }

  // Toast Message Notification Helper
  function showToast(message) {
    let toast = document.getElementById('toast-message');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-message';
      toast.className = 'toast-message';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('active');

    if (window.toastTimer) clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
      toast.classList.remove('active');
    }, 2200);
  }

  // Global Search Clear Handler
  window.clearSearchInput = function(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const searchDropdown = document.getElementById('search-dropdown');

    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (searchClearBtn) searchClearBtn.style.display = 'none';
    if (searchDropdown) searchDropdown.style.display = 'none';

    updateFilteredData();
    showToast('🧹 검색어가 지워졌습니다.');
  };

  // Global Category Filter Handler
  window.handleCategoryFilter = function(btnEl, filterType) {
    const chipBtns = document.querySelectorAll('.chip-btn');
    chipBtns.forEach(b => b.classList.remove('active'));

    if (btnEl) {
      btnEl.classList.add('active');
    } else {
      const target = document.querySelector(`.chip-btn[data-filter="${filterType}"]`);
      if (target) target.classList.add('active');
    }

    applyFilter(filterType);
  };

  // Filter Apply Helper
  function applyFilter(filterType) {
    currentFilterType = filterType;

    // Clear search input on chip filter click so search text doesn't block category filtering
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const searchDropdown = document.getElementById('search-dropdown');

    if (searchInput && searchInput.value.length > 0) {
      searchInput.value = '';
      if (searchClearBtn) searchClearBtn.style.display = 'none';
      if (searchDropdown) searchDropdown.style.display = 'none';
    }

    updateFilteredData();

    // Show Toast Notification for clear user feedback
    let labelText = '전체 장소';
    if (filterType === '초등학교') labelText = '🏫 초등학교';
    else if (filterType === '유치원') labelText = '🐥 유치원';
    else if (filterType === '어린이집') labelText = '👶 어린이집';
    else if (filterType === 'danger') labelText = '🚨 주의/위험 구역';
    else if (filterType === 'safe') labelText = '🟢 안전 구역';

    showToast(`${labelText} ${filteredFacilities.length.toLocaleString()}개소 필터링 완료!`);
  }

  function updateFilteredData() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = (searchInput ? searchInput.value : '').trim().toLowerCase();

    filteredFacilities = allFacilities.filter(f => {
      // 1. 100% Pure Category Matching based on CSV Facility Type
      let matchesCategory = true;

      if (currentFilterType === '초등학교') {
        // Show ONLY pure Elementary Schools (7,069 facilities, 100% icon 🏫)
        matchesCategory = (f.type === '초등학교' || f.type === '초등학교+어린이집');
      } else if (currentFilterType === '유치원') {
        // Show ONLY Kindergartens (4,234 facilities, 100% icon 🐥)
        matchesCategory = (f.type === '유치원');
      } else if (currentFilterType === '어린이집') {
        // Show ONLY Daycares (3,054 facilities, 100% icon 👶)
        matchesCategory = (f.type === '어린이집');
      } else if (currentFilterType === 'danger') {
        // Show ONLY Caution (Grade 4) & Danger (Grade 5) zones (3,015 facilities)
        matchesCategory = (f.grade === 4 || f.grade === 5);
      } else if (currentFilterType === 'safe') {
        // Show ONLY Safe (Grade 2) & Very Safe (Grade 1) zones (7,257 facilities)
        matchesCategory = (f.grade === 1 || f.grade === 2);
      }

      if (!matchesCategory) return false;

      // 2. Search Keyword Match
      if (searchQuery.length > 0) {
        const matchesName = f.name.toLowerCase().includes(searchQuery);
        const matchesAddr = f.address.toLowerCase().includes(searchQuery);
        if (!matchesName && !matchesAddr) return false;
      }

      return true;
    });

    renderMarkers(filteredFacilities);
  }

  // Global Header Button Handlers for 100% Guaranteed Execution
  window.downloadPrdFile = function(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    downloadPrdFile();
    showToast('💾 SafeScore_Kids_PRD.md 다운로드를 시작합니다.');
  };

  window.openPrdModal = function(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    openPrdModal();
    showToast('📄 PRD 서식 문서를 열었습니다.');
  };

  window.openRankingModalDirect = function(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    openRankingModal('high');
    showToast('🏆 안전지수 랭킹을 열었습니다.');
  };

  // Ranking Modal Logic
  function openRankingModal(rankType = 'high') {
    const rankingModal = document.getElementById('ranking-modal');
    if (!rankingModal) return;

    // Reset active tab button
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(t => {
      if (t.getAttribute('data-rank-type') === rankType) t.classList.add('active');
      else t.classList.remove('active');
    });

    renderRankingList(rankType);
    rankingModal.classList.add('active');
  }

  function renderRankingList(rankType) {
    const rankingList = document.getElementById('ranking-list');
    if (!rankingList) return;

    rankingList.innerHTML = '';

    const sourceData = (allFacilities && allFacilities.length > 0) ? allFacilities : [];

    if (sourceData.length === 0) {
      rankingList.innerHTML = `<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">랭킹 데이터를 로딩 중입니다...</div>`;
      return;
    }

    if (rankType === 'region') {
      // 1. Region Average Ranking (Safest Sido/Sigungu Regions)
      const regionMap = {};
      sourceData.forEach(f => {
        const parts = f.address.split(' ');
        let regionName = parts.slice(0, 2).join(' ');
        if (!regionName || regionName.trim().length === 0) regionName = '기타 지역';

        if (!regionMap[regionName]) {
          regionMap[regionName] = {
            name: regionName,
            totalScore: 0,
            count: 0,
            cctvCount: 0,
            lats: [],
            lngs: []
          };
        }

        regionMap[regionName].totalScore += f.score;
        regionMap[regionName].count += 1;
        regionMap[regionName].cctvCount += f.cctvCount;
        regionMap[regionName].lats.push(f.lat);
        regionMap[regionName].lngs.push(f.lng);
      });

      const regionList = Object.values(regionMap).map(r => {
        const avgScore = (r.totalScore / r.count).toFixed(1);
        const avgLat = r.lats.reduce((a, b) => a + b, 0) / r.lats.length;
        const avgLng = r.lngs.reduce((a, b) => a + b, 0) / r.lngs.length;

        let gradeText = '위험';
        let badgeColor = '#EF4444';
        const numAvg = parseFloat(avgScore);
        if (numAvg >= 90) { gradeText = '매우 안전'; badgeColor = '#10B981'; }
        else if (numAvg >= 75) { gradeText = '안전'; badgeColor = '#34D399'; }
        else if (numAvg >= 60) { gradeText = '보통'; badgeColor = '#FBBF24'; }
        else if (numAvg >= 40) { gradeText = '주의'; badgeColor = '#F97316'; }

        return {
          name: r.name,
          count: r.count,
          avgScore: numAvg,
          cctvCount: r.cctvCount,
          gradeText,
          badgeColor,
          lat: avgLat,
          lng: avgLng
        };
      });

      // Sort by average safety score in descending order (highest score first)
      regionList.sort((a, b) => b.avgScore - a.avgScore);

      regionList.slice(0, 30).forEach((reg, idx) => {
        const item = document.createElement('div');
        item.className = `ranking-item rank-${idx + 1}`;
        let medalIcon = `${idx + 1}위`;
        if (idx === 0) medalIcon = '🥇 1위';
        else if (idx === 1) medalIcon = '🥈 2위';
        else if (idx === 2) medalIcon = '🥉 3위';

        item.innerHTML = `
          <div class="ranking-left">
            <div class="rank-number" style="width: auto; padding: 0 8px;">${medalIcon}</div>
            <div>
              <div class="rank-name">📍 ${reg.name}</div>
              <div class="rank-sub">보호구역 ${reg.count}개소 · 총 CCTV ${reg.cctvCount}대</div>
            </div>
          </div>
          <div class="search-item-badge" style="background-color: ${reg.badgeColor}">
            평균 ${reg.avgScore}점 (${reg.gradeText})
          </div>
        `;

        item.addEventListener('click', () => {
          const rankingModal = document.getElementById('ranking-modal');
          if (rankingModal) rankingModal.classList.remove('active');
          
          const searchInput = document.getElementById('search-input');
          const searchClearBtn = document.getElementById('search-clear-btn');
          if (searchInput) {
            searchInput.value = reg.name;
            if (searchClearBtn) searchClearBtn.style.display = 'block';
          }
          updateFilteredData();
          map.flyTo([reg.lat, reg.lng], 13, { duration: 1.5 });
        });

        rankingList.appendChild(item);
      });
      return;
    }

    // 2. Individual Facility Ranking (High to Low or Low to High)
    let sorted = [...sourceData];
    if (rankType === 'high') {
      // Safest Facilities FIRST (Descending Order: 100pt, 98pt, 95pt...)
      sorted.sort((a, b) => b.score - a.score || b.cctvCount - a.cctvCount || b.roadWidth - a.roadWidth);
    } else {
      // Lowest Safety Facilities FIRST (Ascending Order: 0pt, 10pt, 20pt...)
      sorted.sort((a, b) => a.score - b.score || a.cctvCount - b.cctvCount || a.roadWidth - b.roadWidth);
    }

    // TOP 30 Rankings
    const topList = sorted.slice(0, 30);

    topList.forEach((fac, idx) => {
      const item = document.createElement('div');
      item.className = `ranking-item rank-${idx + 1}`;
      let medalIcon = `${idx + 1}위`;
      if (idx === 0) medalIcon = '🥇 1위';
      else if (idx === 1) medalIcon = '🥈 2위';
      else if (idx === 2) medalIcon = '🥉 3위';

      item.innerHTML = `
        <div class="ranking-left">
          <div class="rank-number" style="width: auto; padding: 0 8px;">${medalIcon}</div>
          <div>
            <div class="rank-name">${fac.icon} ${fac.name}</div>
            <div class="rank-sub">${fac.address} · CCTV ${fac.cctvCount}대 · 폭 ${fac.roadWidth}m</div>
          </div>
        </div>
        <div class="search-item-badge" style="background-color: ${fac.badgeColor}">
          ${fac.score}점 (${fac.gradeText})
        </div>
      `;

      item.addEventListener('click', () => {
        const rankingModal = document.getElementById('ranking-modal');
        if (rankingModal) rankingModal.classList.remove('active');
        map.flyTo([fac.lat, fac.lng], 16, { duration: 1.5 });
        openDetailModal(fac);
      });

      rankingList.appendChild(item);
    });
  }
});
