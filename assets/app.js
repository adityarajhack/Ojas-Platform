/**
 * Ojas - Global Application Helper Scripts
 * Handles Accessibility Text Zoom, Mobile Drawer, Search Filtering & Interactive Features
 */

(function () {
  'use strict';

  // 1. Accessibility Text Sizing (A- / A / A+)
  const FONT_KEY = 'janasetu_font_scale';
  const scales = {
    dec: 0.9,
    normal: 1.0,
    inc: 1.15
  };

  function applyFontScale(scale) {
    document.documentElement.style.fontSize = scale === 1.0 ? '' : (scale * 100) + '%';
    localStorage.setItem(FONT_KEY, scale);
  }

  const savedScale = parseFloat(localStorage.getItem(FONT_KEY) || '1.0');
  if (savedScale && savedScale !== 1.0) {
    applyFontScale(savedScale);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Accessibility buttons
    const btnDec = document.querySelector('[aria-label="Decrease text size"]');
    const btnReset = document.querySelector('[aria-label="Reset text size"]');
    const btnInc = document.querySelector('[aria-label="Increase text size"]');

    if (btnDec) btnDec.addEventListener('click', (e) => { e.preventDefault(); applyFontScale(scales.dec); });
    if (btnReset) btnReset.addEventListener('click', (e) => { e.preventDefault(); applyFontScale(scales.normal); });
    if (btnInc) btnInc.addEventListener('click', (e) => { e.preventDefault(); applyFontScale(scales.inc); });

    // 2. Mobile Menu Toggle
    const mobileBtn = document.querySelector('[aria-label="Toggle navigation menu"]');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileBtn && mobileMenu) {
      mobileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = mobileMenu.classList.contains('hidden');
        if (isHidden) {
          mobileMenu.classList.remove('hidden');
        } else {
          mobileMenu.classList.add('hidden');
        }
      });

      // Close menu on outside click
      document.addEventListener('click', (e) => {
        if (!mobileMenu.contains(e.target) && !mobileBtn.contains(e.target)) {
          mobileMenu.classList.add('hidden');
        }
      });
    }

    // 3. Scheme Live Search Filter (Index page & Hero Static Search)
    function filterSchemes(query, category) {
      const q = (query || '').toLowerCase().trim();
      const cat = (category || '').toLowerCase().trim();
      const schemeCards = document.querySelectorAll('.scheme-card, [data-scheme-item]');
      
      schemeCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const matchesQuery = !q || text.includes(q);
        const matchesCat = !cat || text.includes(cat);
        
        if (matchesQuery && matchesCat) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    // 3.0 Comprehensive Active Welfare Schemes Registry for Hero Search
    const ACTIVE_WELFARE_SCHEMES = [
      {
        code: 'SBM_TOILET',
        slug: 'pmay-g',
        name: 'Swachh Bharat Rural Sanitation (PMAY-G Toilet)',
        ministry: 'Ministry of Rural Development (MoRD)',
        grantUnit: 'PROPERTY',
        grantUnitLabel: 'Property / Dwelling',
        benefit: '₹12,000 Direct Support',
        icon: '🚽',
        cardId: 'scheme-card-pmayg',
        keywords: ['toilet', 'pmay', 'pmay-g', 'sanitation', 'swachh bharat', 'ihl', 'latrine', 'rural toilet', 'dwelling', '12000']
      },
      {
        code: 'PM_KISAN',
        slug: 'pm-kisan',
        name: 'PM-Kisan Samman Nidhi',
        ministry: 'Ministry of Agriculture & Farmers Welfare',
        grantUnit: 'INDIVIDUAL',
        grantUnitLabel: 'Individual (Farmer)',
        benefit: '₹6,000 / Year DBT',
        icon: '🌾',
        cardId: 'scheme-card-pm-kisan',
        keywords: ['kisan', 'farmer', 'agriculture', 'income support', 'samman', '6000', 'dbt', 'landholder', 'annually']
      },
      {
        code: 'OLD_AGE_PENSION',
        slug: 'nsap-pension',
        name: 'Indira Gandhi National Old Age Pension (NSAP)',
        ministry: 'Ministry of Rural Development & Social Welfare',
        grantUnit: 'INDIVIDUAL',
        grantUnitLabel: 'Individual (Senior 60+)',
        benefit: '₹3,000 / Month DBT',
        icon: '👴',
        cardId: 'scheme-card-nsap-pension',
        keywords: ['pension', 'old age', 'senior citizen', 'nsap', 'elderly', '60', 'social security', 'monthly', 'retirement']
      },
      {
        code: 'UJJWALA_GAS',
        slug: 'ujjwala',
        name: 'Pradhan Mantri Ujjwala Yojana 2.0 (LPG Gas)',
        ministry: 'Ministry of Petroleum & Natural Gas',
        grantUnit: 'HOUSEHOLD',
        grantUnitLabel: 'Household (Adult Female)',
        benefit: 'Free LPG Connection + Stove',
        icon: '🔥',
        cardId: 'scheme-card-ujjwala',
        keywords: ['gas', 'cylinder', 'ujjwala', 'lpg', 'cooking', 'women', 'fuel', 'stove', 'kitchen', 'connection']
      },
      {
        code: 'SCHOLARSHIP_MERIT',
        slug: 'scholarship',
        name: 'National Pre-Matric & Higher Scholarship',
        ministry: 'Ministry of Education & Social Justice',
        grantUnit: 'INDIVIDUAL',
        grantUnitLabel: 'Individual (Student)',
        benefit: 'Up to ₹25,000 / Year',
        icon: '🎓',
        cardId: 'scheme-card-scholarship',
        keywords: ['scholarship', 'student', 'education', 'school', 'college', 'merit', 'books', 'pre-matric', 'admission', 'tuition']
      },
      {
        code: 'AYUSHMAN_PMJAY',
        slug: 'ayushman',
        name: 'Ayushman Bharat - PM-JAY (Health Cover)',
        ministry: 'National Health Authority (MoHFW)',
        grantUnit: 'HOUSEHOLD',
        grantUnitLabel: 'Household (Family)',
        benefit: '₹5,00,000 Cashless Cover/Yr',
        icon: '🏥',
        cardId: 'scheme-card-ayushman',
        keywords: ['health', 'ayushman', 'pmjay', 'medical', 'hospital', 'cashless', 'insurance', '5 lakh', 'treatment', 'doctor', 'surgery']
      },
      {
        code: 'PMAY_HOUSING',
        slug: 'pmay-housing',
        name: 'Pradhan Mantri Awas Yojana (Housing / Gramin)',
        ministry: 'Ministry of Rural Development (MoRD)',
        grantUnit: 'HOUSEHOLD',
        grantUnitLabel: 'Household (Family)',
        benefit: '₹1,20,000 Pucca House Grant',
        icon: '🏠',
        cardId: 'scheme-card-pmayg',
        keywords: ['housing', 'awas', 'home', 'gramin', 'construction', 'pucca house', 'shelter', '120000', 'makaan']
      },
      {
        code: 'MATERNITY_BENEFIT',
        slug: 'maternity',
        name: 'Pradhan Mantri Matru Vandana Yojana (Maternity)',
        ministry: 'Ministry of Women & Child Development',
        grantUnit: 'INDIVIDUAL',
        grantUnitLabel: 'Individual (Mother)',
        benefit: '₹6,000 Cash Incentive',
        icon: '🤱',
        cardId: 'scheme-card-ayushman',
        keywords: ['maternity', 'mother', 'pregnant', 'child', 'baby', 'women', 'nutrition', '6000', 'matru', 'birth']
      }
    ];

    const heroQueryInput = document.getElementById('heroSchemeQuery');
    const heroLocationInput = document.getElementById('heroLocationQuery');
    const heroCategorySelect = document.getElementById('heroCategorySelect');
    const heroResultsDropdown = document.getElementById('heroSearchResults');
    let selectedDropdownIndex = -1;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function highlightMatch(text, query) {
      if (!query || !query.trim()) return escapeHtml(text);
      const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedQuery})`, 'gi');
      return escapeHtml(text).replace(regex, '<mark>$1</mark>');
    }

    function getMatchingSchemes(q) {
      if (!q || !q.trim()) {
        return ACTIVE_WELFARE_SCHEMES.slice(0, 4); // Top 4 featured
      }
      const clean = q.toLowerCase().trim();
      return ACTIVE_WELFARE_SCHEMES.filter(s => {
        if (s.name.toLowerCase().includes(clean)) return true;
        if (s.code.toLowerCase().includes(clean)) return true;
        if (s.ministry.toLowerCase().includes(clean)) return true;
        if (s.benefit.toLowerCase().includes(clean)) return true;
        if (s.grantUnitLabel.toLowerCase().includes(clean)) return true;
        return s.keywords.some(k => k.includes(clean) || clean.includes(k));
      });
    }

    function renderHeroSearchResults(q) {
      if (!heroResultsDropdown) return;
      const clean = (q || '').trim();
      const matches = getMatchingSchemes(clean);
      selectedDropdownIndex = -1;

      if (!clean) {
        // Empty query: Show Trending / Popular Schemes
        let html = `
          <div class="hero-search-header">
            <span>⭐ Trending &amp; Popular Welfare Schemes</span>
            <span class="hero-search-header-badge">${matches.length} Featured</span>
          </div>
        `;
        matches.forEach(s => {
          html += createSearchItemHtml(s, clean);
        });
        heroResultsDropdown.innerHTML = html;
        heroResultsDropdown.classList.remove('hidden');
        attachSearchItemListeners();
        return;
      }

      if (matches.length === 0) {
        // No matches found: Show Friendly Zero-state with Suggestion Chips
        heroResultsDropdown.innerHTML = `
          <div class="hero-search-empty">
            <div class="hero-search-empty-icon">🔍</div>
            <div class="hero-search-empty-text">No welfare schemes found matching "${escapeHtml(clean)}"</div>
            <div class="hero-search-empty-sub">Explore active welfare schemes by category:</div>
            <div class="hero-search-chips">
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('toilet')">🚽 Toilet (PMAY-G)</button>
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('kisan')">🌾 PM-Kisan</button>
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('pension')">👴 Old Age Pension</button>
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('gas')">🔥 Ujjwala Gas</button>
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('scholarship')">🎓 Scholarship</button>
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('ayushman')">🏥 Ayushman Bharat</button>
              <button type="button" class="hero-search-chip" onclick="setHeroQuery('housing')">🏠 PMAY Housing</button>
            </div>
          </div>
        `;
        heroResultsDropdown.classList.remove('hidden');
        return;
      }

      // Found matches
      let html = `
        <div class="hero-search-header">
          <span>Available Schemes (${matches.length} Matches)</span>
          <span class="hero-search-header-badge">Instant Verification</span>
        </div>
      `;
      matches.forEach(s => {
        html += createSearchItemHtml(s, clean);
      });
      heroResultsDropdown.innerHTML = html;
      heroResultsDropdown.classList.remove('hidden');
      attachSearchItemListeners();
    }

    function createSearchItemHtml(s, query) {
      const scopeIcon = s.grantUnit === 'HOUSEHOLD' ? '🏠' : (s.grantUnit === 'PROPERTY' ? '🏡' : '👤');
      return `
        <div class="hero-search-item" data-code="${s.code}" data-slug="${s.slug}" data-card-id="${s.cardId}" role="option">
          <div class="hero-search-icon-box" aria-hidden="true">${s.icon}</div>
          <div class="hero-search-info">
            <div class="hero-search-title">${highlightMatch(s.name, query)}</div>
            <div class="hero-search-sub">
              <span class="hero-search-tag-scope">${scopeIcon} ${escapeHtml(s.grantUnitLabel)}</span>
              <span class="hero-search-tag-benefit">${escapeHtml(s.benefit)}</span>
              <span class="hero-search-tag-ministry" title="${escapeHtml(s.ministry)}">${escapeHtml(s.ministry)}</span>
            </div>
          </div>
          <div class="hero-search-actions" onclick="event.stopPropagation()">
            <a href="apply.html?scheme=${encodeURIComponent(s.slug)}&mode=check" class="hero-search-btn-check" title="Check eligibility without logging in">
              ⚡ Check Eligibility
            </a>
            <a href="apply.html?scheme=${encodeURIComponent(s.slug)}" class="hero-search-btn-apply" title="Apply for this scheme">
              Apply Now
            </a>
          </div>
        </div>
      `;
    }

    function attachSearchItemListeners() {
      if (!heroResultsDropdown) return;
      const items = heroResultsDropdown.querySelectorAll('.hero-search-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          const cardId = item.getAttribute('data-card-id');
          const slug = item.getAttribute('data-slug');
          const title = item.querySelector('.hero-search-title')?.textContent || '';
          
          if (heroQueryInput) {
            heroQueryInput.value = title;
            runHeroFilter();
          }
          hideHeroSearchDropdown();

          // Scroll to specific card in schemesGrid if present
          const targetCard = cardId ? document.getElementById(cardId) : null;
          const gridTarget = targetCard || document.getElementById('schemesGrid') || document.querySelector('.scheme-card')?.closest('section');
          
          if (gridTarget) {
            if (window.lenis) {
              window.lenis.scrollTo(gridTarget, { offset: -90, duration: 1.2 });
            } else {
              gridTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (targetCard) {
              targetCard.classList.add('ring-4', 'ring-orange-500', 'ring-offset-2', 'transition-all');
              setTimeout(() => {
                targetCard.classList.remove('ring-4', 'ring-orange-500', 'ring-offset-2');
              }, 2500);
            }
          }
        });
      });
    }

    function hideHeroSearchDropdown() {
      if (heroResultsDropdown) {
        heroResultsDropdown.classList.add('hidden');
        selectedDropdownIndex = -1;
      }
    }

    window.setHeroQuery = function (keyword) {
      if (!heroQueryInput) return;
      heroQueryInput.value = keyword;
      runHeroFilter();
      renderHeroSearchResults(keyword);
      heroQueryInput.focus();
    };

    function runHeroFilter() {
      const q = heroQueryInput ? heroQueryInput.value : '';
      const locOrCat = heroLocationInput && heroLocationInput.value ? heroLocationInput.value : (heroCategorySelect ? heroCategorySelect.value : '');
      filterSchemes(q, locOrCat);
    }

    if (heroQueryInput) {
      heroQueryInput.addEventListener('focus', () => {
        renderHeroSearchResults(heroQueryInput.value);
      });

      heroQueryInput.addEventListener('input', () => {
        runHeroFilter();
        renderHeroSearchResults(heroQueryInput.value);
      });

      // Keyboard navigation in search dropdown
      heroQueryInput.addEventListener('keydown', (e) => {
        if (!heroResultsDropdown || heroResultsDropdown.classList.contains('hidden')) return;
        const items = heroResultsDropdown.querySelectorAll('.hero-search-item');
        if (!items || items.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedDropdownIndex = (selectedDropdownIndex + 1) % items.length;
          updateDropdownSelection(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedDropdownIndex = (selectedDropdownIndex - 1 + items.length) % items.length;
          updateDropdownSelection(items);
        } else if (e.key === 'Enter') {
          if (selectedDropdownIndex >= 0 && selectedDropdownIndex < items.length) {
            e.preventDefault();
            items[selectedDropdownIndex].click();
          }
        } else if (e.key === 'Escape') {
          hideHeroSearchDropdown();
        }
      });
    }

    function updateDropdownSelection(items) {
      items.forEach((item, idx) => {
        if (idx === selectedDropdownIndex) {
          item.classList.add('is-selected');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('is-selected');
        }
      });
    }

    // Dismiss search dropdown on outside click
    document.addEventListener('click', (e) => {
      const wrap = document.querySelector('.hero-pill-search-wrap');
      if (wrap && !wrap.contains(e.target)) {
        hideHeroSearchDropdown();
      }
    });

    if (heroLocationInput) {
      heroLocationInput.addEventListener('input', runHeroFilter);
    }

    if (heroCategorySelect) {
      heroCategorySelect.addEventListener('change', runHeroFilter);
    }

    window.handleHeroSearch = function (e) {
      if (e) e.preventDefault();
      runHeroFilter();
      
      const q = heroQueryInput ? heroQueryInput.value : '';
      if (q && q.trim()) {
        renderHeroSearchResults(q);
      }

      const target = document.getElementById('schemesGrid') || document.querySelector('.scheme-card')?.closest('section');
      if (target) {
        if (window.lenis) {
          window.lenis.scrollTo(target, { offset: -90, duration: 1.2 });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    // 3.1 Typewriter placeholder typing animation for Hero Search
    if (heroQueryInput) {
      const typePhrases = [
        "Search PM-Kisan Samman Nidhi...",
        "Search PMAY-G Housing & Latrine...",
        "Search Ayushman Bharat PM-JAY...",
        "Search PM Ujjwala 2.0 Gas...",
        "Search Old Age Pension (NSAP)...",
        "Search Pre-Matric Scholarship...",
        "Search schemes, benefits, applications..."
      ];
      let pIdx = 0;
      let cIdx = 0;
      let isDeleting = false;
      let typeTimer = null;
      let isFocused = false;

      function typeLoop() {
        if (isFocused || (heroQueryInput.value && heroQueryInput.value.length > 0)) {
          return;
        }

        const currentPhrase = typePhrases[pIdx];

        if (!isDeleting) {
          heroQueryInput.setAttribute('placeholder', currentPhrase.substring(0, cIdx + 1));
          cIdx++;
          if (cIdx >= currentPhrase.length) {
            isDeleting = true;
            typeTimer = setTimeout(typeLoop, 1800);
          } else {
            typeTimer = setTimeout(typeLoop, 65);
          }
        } else {
          heroQueryInput.setAttribute('placeholder', currentPhrase.substring(0, cIdx - 1));
          cIdx--;
          if (cIdx <= 0) {
            isDeleting = false;
            pIdx = (pIdx + 1) % typePhrases.length;
            typeTimer = setTimeout(typeLoop, 400);
          } else {
            typeTimer = setTimeout(typeLoop, 35);
          }
        }
      }

      heroQueryInput.addEventListener('focus', () => {
        isFocused = true;
        clearTimeout(typeTimer);
        heroQueryInput.setAttribute('placeholder', 'Search schemes, benefits, applications...');
      });

      heroQueryInput.addEventListener('blur', () => {
        isFocused = false;
        if (!heroQueryInput.value.trim()) {
          cIdx = 0;
          isDeleting = false;
          typeTimer = setTimeout(typeLoop, 600);
        }
      });

      // Start initial typewriter loop after brief delay
      typeTimer = setTimeout(typeLoop, 800);
    }

    // 3.2 Voice Search Implementation (Web Speech API)
    window.startVoiceSearch = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      const input = document.getElementById('heroSchemeQuery');
      const btn = document.getElementById('heroVoiceSearchBtn');

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Voice search is not supported by this browser. Please use Google Chrome or Microsoft Edge.');
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'hi-IN'; // Recognizes both Hindi and Indian English keywords
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = function () {
          if (btn) btn.classList.add('is-listening');
          if (input) {
            input.setAttribute('placeholder', 'Listening... Speak now (e.g. PM-Kisan)');
          }
        };

        recognition.onresult = function (event) {
          const transcript = event.results[0][0].transcript;
          if (input) {
            input.value = transcript;
            runHeroFilter();
            renderHeroSearchResults(transcript);
          }
        };

        recognition.onerror = function (event) {
          console.warn('Speech recognition status:', event.error);
          if (btn) btn.classList.remove('is-listening');
          if (input && !input.value.trim()) {
            input.setAttribute('placeholder', 'Search schemes, benefits, applications...');
          }
        };

        recognition.onend = function () {
          if (btn) btn.classList.remove('is-listening');
          if (input && input.value.trim()) {
            runHeroFilter();
            renderHeroSearchResults(input.value.trim());
            const target = document.getElementById('schemesGrid') || document.querySelector('.scheme-card')?.closest('section');
            if (target) {
              if (window.lenis) {
                window.lenis.scrollTo(target, { offset: -90, duration: 1.2 });
              } else {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          }
        };

        recognition.start();
      } catch (err) {
        console.error('Voice search error:', err);
        if (btn) btn.classList.remove('is-listening');
      }
    };

    const searchInputs = document.querySelectorAll('input[placeholder*="Search schemes"]');
    searchInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        filterSchemes(e.target.value, '');
      });
    });

    // 4. Announcements Ticker (Index page)
    const announcements = [
      "PMAY-G household-level claims are now auto-checked against the household benefit register before submission.",
      "Birth registration records from 2024 onwards are auto-linked to the citizen life record within 48 hours.",
      "Officials: verification queues now show prior household benefits inline — no need to open separate department portals."
    ];
    let currentAnnounce = 0;
    const announceText = document.getElementById('announcement-text');
    const announceDots = document.querySelectorAll('[data-announce-dot]');

    function showAnnouncement(idx) {
      if (!announceText) return;
      currentAnnounce = (idx + announcements.length) % announcements.length;
      announceText.textContent = announcements[currentAnnounce];
      announceDots.forEach((dot, i) => {
        if (i === currentAnnounce) {
          dot.className = "size-2.5 rounded-full transition-colors bg-saffron-deep shadow-xs";
        } else {
          dot.className = "size-2 rounded-full transition-colors bg-muted-foreground/30";
        }
      });
    }

    announceDots.forEach((dot, idx) => {
      dot.addEventListener('click', () => showAnnouncement(idx));
    });

    if (announceText) {
      setInterval(() => {
        showAnnouncement(currentAnnounce + 1);
      }, 5000);
    }

    // 5. Hero Banner Slider Carousel
    const bgSlides = document.querySelectorAll('.hero-bg-slide, .hero-slide');
    const textSlides = document.querySelectorAll('.hero-text-slide');
    const dots = document.querySelectorAll('.glass-slider-dot');
    const prevBtn = document.querySelector('.glass-slider-prev');
    const nextBtn = document.querySelector('.glass-slider-next');
    const sliderContainer = document.querySelector('.hero-slider-wrap');
    const progressBar = document.querySelector('.glass-slider-bar');

    const totalSlides = Math.max(bgSlides.length, textSlides.length);

    if (totalSlides > 0) {
      let currentSlide = 0;
      let slideInterval = null;
      const DURATION = 6000;

      function updateSlide(index) {
        currentSlide = (index + totalSlides) % totalSlides;
        
        bgSlides.forEach((bg, idx) => {
          if (idx === currentSlide) {
            bg.classList.add('active');
          } else {
            bg.classList.remove('active');
          }
        });

        textSlides.forEach((txt, idx) => {
          if (idx === currentSlide) {
            txt.classList.add('active');
          } else {
            txt.classList.remove('active');
          }
        });

        dots.forEach((d, idx) => {
          if (idx === currentSlide) {
            d.classList.add('active');
          } else {
            d.classList.remove('active');
          }
        });

        resetTimer();
      }

      window.handleHeroPrev = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        updateSlide(currentSlide - 1);
      };

      window.handleHeroNext = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        updateSlide(currentSlide + 1);
      };

      function resetTimer() {
        if (slideInterval) clearInterval(slideInterval);
        if (progressBar) {
          progressBar.style.transition = 'none';
          progressBar.style.width = '0%';
          setTimeout(() => {
            progressBar.style.transition = `width ${DURATION}ms linear`;
            progressBar.style.width = '100%';
          }, 30);
        }
        slideInterval = setInterval(() => {
          updateSlide(currentSlide + 1);
        }, DURATION);
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
          e.preventDefault();
          updateSlide(currentSlide - 1);
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
          e.preventDefault();
          updateSlide(currentSlide + 1);
        });
      }

      dots.forEach((dot, idx) => {
        dot.addEventListener('click', () => updateSlide(idx));
      });

      // Pause on hover
      if (sliderContainer) {
        sliderContainer.addEventListener('mouseenter', () => {
          if (slideInterval) clearInterval(slideInterval);
          if (progressBar) progressBar.style.width = '0%';
        });
        sliderContainer.addEventListener('mouseleave', () => {
          resetTimer();
        });

        // Touch Swipe
        let touchStartX = 0;
        let touchEndX = 0;
        sliderContainer.addEventListener('touchstart', (e) => {
          touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        sliderContainer.addEventListener('touchend', (e) => {
          touchEndX = e.changedTouches[0].screenX;
          if (touchStartX - touchEndX > 50) {
            updateSlide(currentSlide + 1);
          } else if (touchEndX - touchStartX > 50) {
            updateSlide(currentSlide - 1);
          }
        }, { passive: true });
      }

      // Initial start
      resetTimer();
    }
  });

  // Global AICTE Navbar Handlers
  window.toggleDropdown = function (id, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const target = document.getElementById(id);
    const wasShown = target && target.classList.contains('show');
    
    // Close all open dropdowns
    document.querySelectorAll('.aicte-dropdown-card.show').forEach(el => el.classList.remove('show'));
    
    if (target && !wasShown) {
      target.classList.add('show');
    }
  };

  window.toggleImportantNote = function (show) {
    const modal = document.getElementById('importantNoteModal');
    if (!modal) return;
    if (show) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    } else {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  };

  window.toggleMobileNav = function () {
    const menu = document.getElementById('mobileDrawerNav');
    const btn = document.getElementById('mobileMenuBtn');
    if (menu) {
      const isHidden = menu.classList.contains('hidden');
      if (isHidden) {
        menu.classList.remove('hidden');
        if (btn) {
          btn.classList.add('active');
          btn.setAttribute('aria-expanded', 'true');
        }
      } else {
        menu.classList.add('hidden');
        if (btn) {
          btn.classList.remove('active');
          btn.setAttribute('aria-expanded', 'false');
        }
      }
    }
  };

  // Close mobile drawer on link click or outside click
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('mobileDrawerNav');
    const btn = document.getElementById('mobileMenuBtn');
    if (menu && !menu.classList.contains('hidden')) {
      if (e.target.closest('#mobileDrawerNav a') || (btn && !btn.contains(e.target) && !menu.contains(e.target))) {
        menu.classList.add('hidden');
        if (btn) {
          btn.classList.remove('active');
          btn.setAttribute('aria-expanded', 'false');
        }
      }
    }
  });

  // Auto-close mobile drawer if viewport resized to desktop (>= 1024px)
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 1024) {
      const menu = document.getElementById('mobileDrawerNav');
      const btn = document.getElementById('mobileMenuBtn');
      if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        if (btn) {
          btn.classList.remove('active');
          btn.setAttribute('aria-expanded', 'false');
        }
      }
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.aicte-dropdown-wrap')) {
      document.querySelectorAll('.aicte-dropdown-card.show').forEach(el => el.classList.remove('show'));
    }
  });

  // Header Scroll Frosted Glass Effect
  function handleHeaderScroll() {
    const header = document.querySelector('.aicte-header-wrapper');
    if (!header) return;
    if (window.scrollY > 15) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }
  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleHeaderScroll);
  } else {
    handleHeaderScroll();
  }

  // Digital India Bhashini / Translation Engine
  function applyTranslateEngine(code) {
    try {
      const target = (code === 'en') ? '/en/en' : ('/en/' + code);
      document.cookie = 'googtrans=' + target + '; path=/';
      const host = window.location.hostname;
      if (host && host !== 'localhost' && !host.startsWith('127.')) {
        document.cookie = 'googtrans=' + target + '; domain=.' + host + '; path=/';
      }
    } catch (e) {}

    function triggerCombo() {
      const combo = document.querySelector('.goog-te-combo');
      if (combo) {
        combo.value = code;
        combo.dispatchEvent(new Event('change'));
        return true;
      }
      return false;
    }

    if (!triggerCombo()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (triggerCombo() || attempts > 20) {
          clearInterval(interval);
        }
      }, 150);
    }
  }

  window.googleTranslateElementInit = function () {
    try {
      new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,hi,bn,mr,te,ta,gu,kn,ml,pa,or,as',
        autoDisplay: false
      }, 'google_translate_element');

      const savedLang = localStorage.getItem('janasetu_lang');
      if (savedLang && savedLang !== 'en') {
        setTimeout(() => applyTranslateEngine(savedLang), 350);
      }
    } catch (e) {}
  };

  (function ensureTranslateEngine() {
    function initContainer() {
      if (!document.getElementById('google_translate_element')) {
        const div = document.createElement('div');
        div.id = 'google_translate_element';
        div.style.display = 'none';
        document.body.appendChild(div);
      }
    }
    if (document.body) {
      initContainer();
    } else {
      document.addEventListener('DOMContentLoaded', initContainer);
    }

    if (!document.getElementById('google-translate-script')) {
      const s = document.createElement('script');
      s.id = 'google-translate-script';
      s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      s.async = true;
      document.head.appendChild(s);
    }
  })();

  // Language Selection (Digital India Bhashini)
  window.setLanguage = function (code, name) {
    try {
      localStorage.setItem('janasetu_lang', code);
      localStorage.setItem('janasetu_lang_name', name);
    } catch (e) {}

    document.querySelectorAll('#currentLangLabel').forEach(el => {
      el.textContent = name;
    });

    document.querySelectorAll('.lang-option-btn').forEach(btn => {
      if (btn.getAttribute('data-lang') === code) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.documentElement.setAttribute('lang', code);

    // Close language dropdown
    const langDrop = document.getElementById('languageDropdown');
    if (langDrop) langDrop.classList.remove('show');

    // Trigger full page translation
    applyTranslateEngine(code);
  };

  try {
    const savedLang = localStorage.getItem('janasetu_lang') || 'en';
    const savedLangName = localStorage.getItem('janasetu_lang_name') || 'English';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('#currentLangLabel').forEach(el => el.textContent = savedLangName);
      });
    } else {
      document.querySelectorAll('#currentLangLabel').forEach(el => el.textContent = savedLangName);
    }
  } catch (e) {}
})();

// ==========================================================================
// Modern Smooth Inertia Scrolling (Lenis Engine + Anchors)
// ==========================================================================
(function initSmoothScroll() {
  function startLenis() {
    if (typeof Lenis !== 'undefined') {
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        direction: 'vertical',
        gestureDirection: 'vertical',
        smooth: true,
        mouseMultiplier: 0.95,
        smoothTouch: false, // native smooth momentum on mobile touch devices
        touchMultiplier: 1.8,
      });

      window.lenis = lenis;
      if (typeof handleHeaderScroll === 'function') {
        lenis.on('scroll', handleHeaderScroll);
      }

      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      // Handle on-page anchor smooth scroll
      document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a[href*="#"]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href === '#' || href === '#!') return;

        try {
          const url = new URL(anchor.href, window.location.href);
          if (url.pathname === window.location.pathname && url.hash) {
            const target = document.querySelector(url.hash);
            if (target) {
              e.preventDefault();
              lenis.scrollTo(target, { offset: -92, duration: 1.1 });
              if (history.pushState) {
                history.pushState(null, null, url.hash);
              }
            }
          }
        } catch (err) {}
      });

      // Smooth scroll on page load if hash present
      if (window.location.hash) {
        window.addEventListener('load', function () {
          setTimeout(function () {
            try {
              const target = document.querySelector(window.location.hash);
              if (target) {
                lenis.scrollTo(target, { offset: -92, duration: 1.1 });
              }
            } catch (err) {}
          }, 150);
        });
      }
    } else {
      // Fallback native anchor smooth scroll
      document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a[href*="#"]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href === '#' || href === '#!') return;

        try {
          const url = new URL(anchor.href, window.location.href);
          if (url.pathname === window.location.pathname && url.hash) {
            const target = document.querySelector(url.hash);
            if (target) {
              e.preventDefault();
              const headerOffset = 92;
              const elementPosition = target.getBoundingClientRect().top;
              const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
              window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
              });
              if (history.pushState) {
                history.pushState(null, null, url.hash);
              }
            }
          }
        } catch (err) {}
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startLenis);
  } else {
    startLenis();
  }
})();

// ==========================================================================
// Interactive Application & Document Processing Tracker
// ==========================================================================
(function initCaseStudyTracker() {
  const sampleAppsData = {
    'APP/2026/08412': {
      id: 'APP/2026/08412',
      applicant: 'Ramesh Kumar',
      category: 'Household Head · BPL',
      scheme: 'Swachh Bharat Rural Sanitation (PMAY-G Toilet)',
      appliedDate: '18 Feb 2026',
      currentDesk: 'District Ayodhya · DBT Disbursal Cell',
      currentStageName: 'Stage 5: Direct Benefit Transfer (DBT) Credited',
      statusBadge: '✓ Sanctioned & Disbursed',
      statusBadgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      currentOfficeNote: 'All statutory documents verified. Sanction grant ₹12,000 released via PFMS / APBS directly into SBI A/c ••••4092 (UTR: APBS9940128).',
      documents: [
        { name: 'Aadhaar e-KYC', authority: 'UIDAI CIDR Service', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'BPL / SECC Certificate', authority: 'Tehsildar Office', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'Dwelling & Cadastre Proof', authority: 'Revenue Dept Cadastre', status: '✓ Clear (HH-22-0147)', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'Bank Account & NPCI Link', authority: 'State Bank of India', status: '✓ APBS Active', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
      ],
      stages: [
        {
          title: 'Stage 1: Application & Document Submission',
          time: '18 Feb 2026 · 10:14 AM',
          desk: 'National Welfare Portal · Online Submission',
          status: 'completed',
          icon: '✓',
          badgeText: 'Form & Docs Received',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Citizen filed online application. Form, Aadhaar e-KYC, BPL certificate, and bank mandate uploaded and digitally hashed into audit trail.'
        },
        {
          title: 'Stage 2: Document Scrutiny & De-duplication Cross-Check',
          time: '18 Feb 2026 · 10:15 AM',
          desk: 'Central Rules Engine & Gram Panchayat Desk',
          status: 'completed',
          icon: '✓',
          badgeText: '0 Duplicates Found',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Automated de-duplication query verified dwelling HH-22-0147 has 0 prior sanitation latrine grants on record. Initial scrutiny cleared.'
        },
        {
          title: 'Stage 3: Ground Verification & Field Inspection',
          time: '18 Feb 2026 · 11:15 AM',
          desk: 'Block Saron · Field Verifying Officer',
          status: 'completed',
          icon: '✓',
          badgeText: 'Inspection Clear',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Junior Engineer & Field Inspector verified site location, geotagged household coordinates, and confirmed applicant is eligible for individual latrine unit.'
        },
        {
          title: 'Stage 4: Sanction Order & Competent Authority Approval',
          time: '18 Feb 2026 · 11:32 AM',
          desk: 'Ayodhya Office · Block Development Officer (BDO)',
          status: 'completed',
          icon: '✓',
          badgeText: 'Order #SO-2026-992 Signed',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Digital Sanction Order generated and approved by BDO Ayodhya with e-Sign. Mandate dispatched to PFMS Treasury portal.'
        },
        {
          title: 'Stage 5: Direct Benefit Transfer (DBT Credit)',
          time: '18 Feb 2026 · 02:45 PM',
          desk: 'Public Financial Management System (PFMS / APBS)',
          status: 'completed',
          icon: '₹',
          badgeText: '₹12,000 Transferred',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Direct payment credited into State Bank of India account ending ••••4092 via Aadhaar Payment Bridge System (UTR: APBS9940128).'
        }
      ]
    },
    'APP/2026/10488': {
      id: 'APP/2026/10488',
      applicant: 'Suresh Kumar',
      category: 'Brother (Co-Habitant · APL)',
      scheme: 'Swachh Bharat Rural Sanitation (PMAY-G Toilet)',
      appliedDate: '22 Mar 2026',
      currentDesk: 'Block Saron · Field Verification Officer Desk',
      currentStageName: 'Stage 3: Field Verification & Ground Inspection (In Progress)',
      statusBadge: '⏳ Under Field Inspection',
      statusBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      currentOfficeNote: 'Aadhaar and income verified. File currently with Block Saron Field Officer to inspect whether dwelling has an independent partition. Zero auto-rejection.',
      documents: [
        { name: 'Aadhaar e-KYC', authority: 'UIDAI CIDR Service', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'APL Income Proof', authority: 'Self-Attested ITR', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'Dwelling Record', authority: 'Revenue Dept Cadastre', status: '⚠️ Shared Dwelling (HH-22-0147)', class: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
        { name: 'Bank Account & NPCI Link', authority: 'Punjab National Bank', status: '✓ NPCI Active', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
      ],
      stages: [
        {
          title: 'Stage 1: Application & Document Submission',
          time: '22 Mar 2026 · 02:40 PM',
          desk: 'National Welfare Portal · Online Submission',
          status: 'completed',
          icon: '✓',
          badgeText: 'Form & Docs Received',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Application registered. Aadhaar authenticated, applicant details linked to household cadastre HH-22-0147.'
        },
        {
          title: 'Stage 2: Document Scrutiny & De-duplication Cross-Check',
          time: '22 Mar 2026 · 02:41 PM',
          desk: 'Central Rules Engine & Scrutiny Cell',
          status: 'flagged',
          icon: '⚠️',
          badgeText: 'Flagged (Household Unit)',
          badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          desc: 'Prior toilet already sanctioned for brother Ramesh Kumar under same dwelling HH-22-0147. Zero-trust rule triggered. Document forwarded to human officer.'
        },
        {
          title: 'Stage 3: Field Verification & Ground Inspection',
          time: 'Active Now · In Progress',
          desk: 'Block Saron · Field Verifying Officer',
          status: 'in-progress',
          icon: '📍',
          badgeText: 'Current Active Stage',
          badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse',
          desc: 'Officer reviewing physical dwelling layout to verify if applicant lives in a partitioned independent living unit. Ground inspection report pending.'
        },
        {
          title: 'Stage 4: Sanction Order & Competent Approval',
          time: 'Awaiting Stage 3 Completion',
          desk: 'Ayodhya Office · Block Development Officer',
          status: 'pending',
          icon: '○',
          badgeText: 'Pending Inspection',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Sanction order generation will commence immediately once field inspection report is submitted.'
        },
        {
          title: 'Stage 5: Direct Benefit Transfer (DBT Credit)',
          time: 'Scheduled after Sanction',
          desk: 'Public Financial Management System (PFMS)',
          status: 'pending',
          icon: '○',
          badgeText: 'On Hold',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Disbursement mandate ready on PFMS pipeline; fund release held pending competent approval.'
        }
      ]
    },
    'APP/2026/11940': {
      id: 'APP/2026/11940',
      applicant: 'Anjali Kumari',
      category: 'Daughter · Student (Class VII)',
      scheme: 'National Pre-Matric Scholarship Scheme',
      appliedDate: '14 Oct 2026',
      currentDesk: 'District Education Office · Document Scrutiny Cell',
      currentStageName: 'Stage 2: Document Scrutiny & School Record Verification (In Progress)',
      statusBadge: '🔍 Documents Under Scrutiny',
      statusBadgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      currentOfficeNote: 'School bonafide certificate uploaded. District Dealing Clerk currently cross-verifying marksheets and parental income certificate with the State Education Board.',
      documents: [
        { name: 'Student Aadhaar e-KYC', authority: 'UIDAI e-KYC', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'School Bonafide Certificate', authority: 'Govt High School Rampur', status: '⏳ Under Scrutiny', class: 'text-blue-300 bg-blue-500/15 border-blue-500/30' },
        { name: 'Parental Income Certificate', authority: 'Tehsildar Office', status: '⏳ Under Scrutiny', class: 'text-blue-300 bg-blue-500/15 border-blue-500/30' },
        { name: 'Student Bank Account', authority: 'Bank of Baroda', status: '✓ Aadhaar Seeded', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
      ],
      stages: [
        {
          title: 'Stage 1: Application & Document Submission',
          time: '14 Oct 2026 · 11:30 AM',
          desk: 'National Scholarship Portal · Online Filing',
          status: 'completed',
          icon: '✓',
          badgeText: 'Application Registered',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Application filed online. Student demographic details, bonafide school certificate, marksheets, and parent Aadhaar linked successfully.'
        },
        {
          title: 'Stage 2: Document Scrutiny & Institution Verification',
          time: 'Active Now · In Progress',
          desk: 'District Education Office · Scrutiny Officer',
          status: 'in-progress',
          icon: '📍',
          badgeText: 'Current Active Stage',
          badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse',
          desc: 'Document verification clerk validating student enrollment in Class VII and cross-referencing school attendance records with the U-DISE database.'
        },
        {
          title: 'Stage 3: District Welfare Officer Verification',
          time: 'Pending Stage 2 Verification',
          desk: 'District Social Welfare Office',
          status: 'pending',
          icon: '○',
          badgeText: 'Awaiting Scrutiny',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Officer scrutiny of eligibility quota and scholarship merit rank.'
        },
        {
          title: 'Stage 4: Sanction Order & Scholarship Award',
          time: 'Scheduled after Verification',
          desk: 'Ministry of Social Justice & Empowerment',
          status: 'pending',
          icon: '○',
          badgeText: 'Awaiting Order',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Sanction letter generation and e-mandate creation on National Scholarship Portal.'
        },
        {
          title: 'Stage 5: Direct Benefit Transfer (DBT Credit)',
          time: 'Disbursal Cycle',
          desk: 'Public Financial Management System (PFMS)',
          status: 'pending',
          icon: '○',
          badgeText: 'Pending Sanction',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Direct credit of scholarship amount ₹ 25,000 into student bank account.'
        }
      ]
    }
  };

  function renderTrackApp(data) {
    const resultBox = document.getElementById('homeTrackResult');
    if (!resultBox) return;

    // 1. Header Information
    const applicantEl = document.getElementById('trackApplicantName');
    const appIdEl = document.getElementById('trackAppId');
    const statusBadge = document.getElementById('trackStatusBadge');
    const schemeEl = document.getElementById('trackSchemeName');
    const dateEl = document.getElementById('trackAppliedDate');
    const deskEl = document.getElementById('trackCurrentDesk');
    const stageTitleEl = document.getElementById('trackCurrentStageTitle');
    const remarkEl = document.getElementById('trackOfficerRemark');

    if (applicantEl) applicantEl.textContent = `${data.applicant} (${data.category || 'Applicant'})`;
    if (appIdEl) appIdEl.textContent = data.id;
    if (statusBadge) {
      let badgeStyle = 'status-disbursed';
      if (data.statusBadgeClass && data.statusBadgeClass.includes('amber')) badgeStyle = 'status-flagged';
      else if (data.statusBadgeClass && data.statusBadgeClass.includes('blue')) badgeStyle = 'status-progress';
      statusBadge.className = `tracker-status-chip ${badgeStyle}`;
      statusBadge.textContent = data.statusBadge || 'Processing';
    }
    if (schemeEl) schemeEl.textContent = data.scheme || 'Welfare Scheme Application';
    if (dateEl) dateEl.textContent = data.appliedDate || 'Recent';
    if (deskEl) deskEl.textContent = data.currentDesk || 'State Verification Desk';
    if (stageTitleEl) stageTitleEl.textContent = data.currentStageName || 'Document Processing Pipeline';
    if (remarkEl) remarkEl.textContent = data.currentOfficeNote || 'Your application is progressing normally through the government verification pipeline.';

    // 2. Document Verification Matrix Checklist
    const docsContainer = document.getElementById('trackDocumentsGrid');
    if (docsContainer && data.documents) {
      let docsHtml = '';
      data.documents.forEach(doc => {
        let badgeVariant = 'badge-success';
        if (doc.status && (doc.status.includes('⚠️') || doc.status.includes('Field') || doc.status.includes('Review'))) {
          badgeVariant = 'badge-warning';
        } else if (doc.status && (doc.status.includes('⏳') || doc.status.includes('Scrutiny'))) {
          badgeVariant = 'badge-info';
        }
        docsHtml += `
          <div class="track-doc-card">
            <div>
              <div class="track-doc-name">
                <span class="text-sm">📄</span>
                <span class="truncate">${doc.name}</span>
              </div>
              <p class="track-doc-authority">${doc.authority || 'Verified Source'}</p>
            </div>
            <div class="track-doc-footer">
              <span class="track-doc-status-label">Status</span>
              <span class="track-doc-badge ${badgeVariant}">${doc.status}</span>
            </div>
          </div>
        `;
      });
      docsContainer.innerHTML = docsHtml;
    }

    // 3. Step-by-Step Processing Pipeline
    const stagesContainer = document.getElementById('trackResultStages');
    if (stagesContainer && data.stages) {
      let html = '';
      const totalStages = data.stages.length;

      data.stages.forEach((st, idx) => {
        const isLast = idx === totalStages - 1;
        let nodeClass = 'node-pending';
        let lineClass = 'line-pending';
        let titleClass = '';
        let badgeClass = 'badge-pending';

        if (st.status === 'completed') {
          nodeClass = 'node-completed';
          lineClass = 'line-completed';
          badgeClass = 'badge-completed';
        } else if (st.status === 'flagged') {
          nodeClass = 'node-flagged';
          lineClass = 'line-flagged';
          titleClass = 'title-flagged';
          badgeClass = 'badge-flagged';
        } else if (st.status === 'in-progress') {
          nodeClass = 'node-in-progress';
          lineClass = 'line-pending';
          titleClass = 'title-active';
          badgeClass = 'badge-in-progress';
        }

        html += `
          <div class="track-stage-item">
            <div class="track-stage-left">
              <div class="track-stage-node ${nodeClass}">
                ${st.icon || (idx + 1)}
              </div>
              ${!isLast ? `<div class="track-stage-line ${lineClass}"></div>` : ''}
            </div>
            <div class="track-stage-right">
              <div class="track-stage-title-row">
                <div class="flex items-center">
                  <h4 class="track-stage-title ${titleClass}">${st.title}</h4>
                  ${st.desk ? `<span class="hidden sm:inline-block track-stage-desk">(${st.desk})</span>` : ''}
                </div>
                <div class="track-stage-badge-time">
                  ${st.badgeText ? `<span class="track-stage-badge ${badgeClass}">${st.badgeText}</span>` : ''}
                  <span class="track-stage-time">${st.time}</span>
                </div>
              </div>
              <p class="track-stage-desc">${st.desc}</p>
            </div>
          </div>
        `;
      });

      stagesContainer.innerHTML = html;
    }

    resultBox.classList.remove('hidden');
    resultBox.style.display = 'block';
    try {
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
  }

  async function lookupAndRenderApp(id) {
    if (!id) return;
    const clean = id.toUpperCase().trim();

    // 0. Query public backend tracking API if available
    try {
      const res = await fetch('/v1/public/track?appNumber=' + encodeURIComponent(clean));
      if (res.ok) {
        const data = await res.json();
        if (data && data.applicationNumber) {
          const statusMap = {
            'SUBMITTED': { stage: 'Stage 1: Application Received', badge: '⏳ Submitted', desc: 'Application recorded in national registry.' },
            'UNDER_VERIFICATION': { stage: 'Stage 2: Scrutiny in Progress', badge: '🔍 Under Review', desc: 'Officer scrutiny and de-duplication cross-checks underway.' },
            'FLAGGED': { stage: 'Stage 2: Flagged for Review', badge: '⚠️ Verification Required', desc: 'Household duplicate benefit check flagged. Transferred to Field Officer for ground inspection.' },
            'APPROVED': { stage: 'Stage 4: Sanctioned & Approved', badge: '✓ Sanction Order Issued', desc: 'Sanction order approved by competent authority.' },
            'DISBURSED': { stage: 'Stage 5: Direct Benefit Transfer (DBT) Credited', badge: '✓ Disbursed', desc: data.disbursement ? `Direct benefit payment ₹${data.disbursement.amount} credited via PFMS/APBS (Ref: ${data.disbursement.transactionRef || 'APBS-OK'}).` : 'Benefit funds disbursed.' },
            'REJECTED': { stage: 'Application Review Completed', badge: '✕ Ineligible', desc: 'Application closed.' }
          };
          const mapped = statusMap[data.currentStatus] || { stage: 'Under Scrutiny', badge: data.currentStatus, desc: 'Processing' };
          
          const dynamicApp = {
            id: data.applicationNumber,
            applicant: 'Registered Citizen Beneficiary',
            category: data.grantUnit ? `Grant Unit: ${data.grantUnit}` : 'Welfare Benefit',
            scheme: data.schemeName || 'National Welfare Scheme',
            appliedDate: data.submittedAt ? new Date(data.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recorded',
            currentDesk: 'Department Verification Desk',
            currentStageName: mapped.stage,
            statusBadge: mapped.badge,
            statusBadgeClass: data.currentStatus === 'DISBURSED' || data.currentStatus === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : (data.currentStatus === 'FLAGGED' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'),
            currentOfficeNote: mapped.desc,
            documents: [
              { name: 'Aadhaar e-KYC', authority: 'UIDAI e-KYC', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
              { name: 'Eligibility Proof', authority: 'Welfare Cadastre', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
              { name: 'Dwelling & Family Cadastre', authority: 'Municipal / Tehsil', status: data.currentStatus === 'FLAGGED' ? '⚠️ Field Check' : '✓ Cleared', class: data.currentStatus === 'FLAGGED' ? 'text-amber-300 bg-amber-500/15 border-amber-500/30' : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
              { name: 'Bank Account & NPCI Link', authority: 'PFMS / APBS', status: data.currentStatus === 'DISBURSED' ? '✓ Credited' : '✓ Linked', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
            ],
            stages: [
              {
                title: 'Stage 1: Application & Document Submission',
                time: data.submittedAt ? new Date(data.submittedAt).toLocaleString('en-IN') : 'Recorded',
                desk: 'National Welfare Portal',
                status: 'completed',
                icon: '✓',
                badgeText: 'Form & Docs Received',
                badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                desc: 'Citizen filed online application. Form, Aadhaar e-KYC, and bank mandate uploaded and digitally hashed into audit trail.'
              },
              {
                title: 'Stage 2: Document Scrutiny & De-duplication Check',
                time: data.timeline && data.timeline[1] ? new Date(data.timeline[1].timestamp).toLocaleTimeString('en-IN') : 'Automated',
                desk: 'Central Rules Engine & Fraud Intelligence',
                status: data.currentStatus === 'SUBMITTED' ? 'in-progress' : (data.currentStatus === 'FLAGGED' ? 'flagged' : 'completed'),
                icon: data.currentStatus === 'FLAGGED' ? '⚠️' : (data.currentStatus === 'SUBMITTED' ? '📍' : '✓'),
                badgeText: data.currentStatus === 'FLAGGED' ? 'Flagged for Review' : 'Scrutiny Clear',
                badgeClass: data.currentStatus === 'FLAGGED' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                desc: data.currentStatus === 'FLAGGED' ? 'Household duplicate benefit check flagged. Transferred to Field Officer for ground inspection without rejection.' : 'Cross-referenced against family rosters and property records. Zero duplicate claims.'
              },
              {
                title: 'Stage 3: Field Inspection & Physical Verification',
                time: 'Ground Officer Desk',
                desk: 'Block Field Office',
                status: data.currentStatus === 'APPROVED' || data.currentStatus === 'DISBURSED' ? 'completed' : (data.currentStatus === 'FLAGGED' ? 'in-progress' : 'pending'),
                icon: data.currentStatus === 'APPROVED' || data.currentStatus === 'DISBURSED' ? '✓' : (data.currentStatus === 'FLAGGED' ? '📍' : '○'),
                badgeText: data.currentStatus === 'FLAGGED' ? 'Field Review Active' : (data.currentStatus === 'APPROVED' || data.currentStatus === 'DISBURSED' ? 'Verified' : 'Pending'),
                badgeClass: data.currentStatus === 'FLAGGED' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse' : 'bg-white/10 text-white/50 border-white/10',
                desc: 'Gram Sevak and Block Officer ground review and dwelling verification report.'
              },
              {
                title: 'Stage 4: Sanction Order Approval',
                time: 'Competent Authority',
                desk: 'Block Development Office',
                status: data.currentStatus === 'DISBURSED' ? 'completed' : (data.currentStatus === 'APPROVED' ? 'in-progress' : 'pending'),
                icon: data.currentStatus === 'DISBURSED' || data.currentStatus === 'APPROVED' ? '✓' : '○',
                badgeText: data.currentStatus === 'APPROVED' || data.currentStatus === 'DISBURSED' ? 'Sanctioned' : 'Upcoming',
                badgeClass: data.currentStatus === 'APPROVED' || data.currentStatus === 'DISBURSED' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/50 border-white/10',
                desc: 'Official digital sanction order generated with QR-verification signature.'
              },
              {
                title: 'Stage 5: Direct Benefit Transfer (DBT Credit)',
                time: data.disbursement ? new Date(data.disbursement.disbursedAt).toLocaleTimeString('en-IN') : 'PFMS Gateway',
                desk: 'PFMS / APBS Gateway',
                status: data.currentStatus === 'DISBURSED' ? 'completed' : 'pending',
                icon: data.currentStatus === 'DISBURSED' ? '✓' : '○',
                badgeText: data.currentStatus === 'DISBURSED' ? 'DBT Credited' : 'Mandate Queued',
                badgeClass: data.currentStatus === 'DISBURSED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-white/10 text-white/50 border-white/10',
                desc: data.disbursement ? `Direct benefit ₹${data.disbursement.amount} released via PFMS directly to linked bank account.` : 'Direct benefit funds released directly into Aadhaar Payment Bridge System (APBS) linked bank account upon sanction.'
              }
            ]
          };
          renderTrackApp(dynamicApp);
          return;
        }
      }
    } catch (err) {
      // Continue to local lookups
    }

    // 1. Direct sample lookup
    if (sampleAppsData[clean]) {
      renderTrackApp(sampleAppsData[clean]);
      return;
    }

    // 2. Partial lookup (e.g. 08412 or 10488 or 11940)
    for (const k in sampleAppsData) {
      const numOnly = k.replace(/[^0-9]/g, '');
      const cleanNum = clean.replace(/[^0-9]/g, '');
      if (k.includes(clean) || (cleanNum && numOnly.includes(cleanNum))) {
        renderTrackApp(sampleAppsData[k]);
        return;
      }
    }

    // 3. User recently submitted application from localStorage
    try {
      const recent = JSON.parse(localStorage.getItem('ojas_recent_apps') || localStorage.getItem('janasetu_recent_apps') || '{}');
      if (recent[clean]) {
        const r = recent[clean];
        const isFlagged = r.status === 'HELD_FOR_VERIFICATION';
        const dynamicData = {
          id: r.id || clean,
          applicant: r.applicant || 'Citizen Applicant',
          category: r.category || 'Direct Application',
          scheme: r.scheme || 'Welfare Scheme Application',
          appliedDate: r.timestamp || 'Today',
          currentDesk: isFlagged ? 'Block Saron · Field Verifying Officer' : 'District Welfare Verification Cell',
          currentStageName: isFlagged ? 'Stage 3: Field Verification & Ground Review' : 'Stage 2: Document Scrutiny & De-duplication Check',
          statusBadge: isFlagged ? '⏳ Held for Field Inspection' : '🔍 Documents Under Scrutiny',
          statusBadgeClass: isFlagged ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
          currentOfficeNote: isFlagged 
            ? 'Application flagged for ground verification (dwelling de-duplication). Case assigned to Block Officer for physical inspection. Never auto-rejected.' 
            : 'Application successfully received. Mandatory documents are undergoing dealing clerk scrutiny.',
          documents: [
            { name: 'Aadhaar e-KYC', authority: 'UIDAI e-KYC', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
            { name: 'Income / Category Proof', authority: 'Revenue Authority', status: '✓ Attached', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
            { name: 'Dwelling Cadastre Proof', authority: 'State Cadastre', status: isFlagged ? '⚠️ Review Needed' : '✓ Linked', class: isFlagged ? 'text-amber-300 bg-amber-500/15 border-amber-500/30' : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
            { name: 'Bank Account & NPCI Link', authority: 'Verified Bank', status: '✓ APBS Ready', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
          ],
          stages: [
            {
              title: 'Stage 1: Application & Document Submission',
              time: r.timestamp || 'Recorded',
              desk: 'Online Welfare Portal',
              status: 'completed',
              icon: '✓',
              badgeText: 'Submitted & Signed',
              badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
              desc: 'Form filled, digital Acknowledgment Receipt generated. Aadhaar authenticated.'
            },
            {
              title: 'Stage 2: Document Scrutiny & De-duplication Check',
              time: 'Completed',
              desk: 'Central Rules Engine',
              status: isFlagged ? 'flagged' : 'completed',
              icon: isFlagged ? '⚠️' : '✓',
              badgeText: isFlagged ? 'Flagged for Review' : 'Scrutiny Passed',
              badgeClass: isFlagged ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
              desc: isFlagged 
                ? 'Household de-duplication condition flagged. Transferred to human officer without rejection.' 
                : 'Zero duplicate claims detected. Statutory eligibility verified.'
            },
            {
              title: 'Stage 3: Field Verification & Ground Inspection',
              time: isFlagged ? 'Active Now' : 'Pending',
              desk: 'Block Field Office',
              status: isFlagged ? 'in-progress' : 'pending',
              icon: isFlagged ? '📍' : '○',
              badgeText: isFlagged ? 'Under Ground Review' : 'Upcoming',
              badgeClass: isFlagged ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse' : 'bg-white/10 text-white/50 border-white/10',
              desc: 'Competent officer verifying field report and ground evidence.'
            },
            {
              title: 'Stage 4: Sanction Order & Competent Approval',
              time: 'Pending Stage 3',
              desk: 'Block Development Office',
              status: 'pending',
              icon: '○',
              badgeText: 'Pending Approval',
              badgeClass: 'bg-white/10 text-white/50 border-white/10',
              desc: 'Sanction letter will be generated upon Stage 3 approval.'
            },
            {
              title: 'Stage 5: Direct Benefit Transfer (DBT Credit)',
              time: 'Disbursal Pipeline',
              desk: 'PFMS / APBS Gateway',
              status: 'pending',
              icon: '○',
              badgeText: 'Mandate Queued',
              badgeClass: 'bg-white/10 text-white/50 border-white/10',
              desc: 'Disbursement will be queued to verified bank account upon sanction.'
            }
          ]
        };
        renderTrackApp(dynamicData);
        return;
      }
    } catch (e) {}

    // 4. Fallback live generation for any valid government application number
    const isFlagged = clean.includes('10488') || clean.endsWith('F');
    const fallbackData = {
      id: clean.startsWith('APP') ? clean : `APP/2026/${clean}`,
      applicant: 'Citizen Beneficiary',
      category: 'Applicant Record',
      scheme: 'National Welfare Scheme',
      appliedDate: 'Recent',
      currentDesk: 'District Social Welfare Office · Verification Desk',
      currentStageName: isFlagged ? 'Stage 3: Field Verification in Progress' : 'Stage 2: Document Scrutiny & Cross-Check',
      statusBadge: isFlagged ? '⏳ Under Officer Review' : '⚡ Under Scrutiny',
      statusBadgeClass: isFlagged ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
      currentOfficeNote: 'Application matched with State Welfare Cadastre. Documents are undergoing official verification.',
      documents: [
        { name: 'Aadhaar e-KYC', authority: 'UIDAI e-KYC', status: '✓ Verified', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'Income / Category Proof', authority: 'Revenue Authority', status: '✓ Attached', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'Dwelling & Address Proof', authority: 'State Cadastre', status: '✓ Matched', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        { name: 'Bank Passbook (NPCI)', authority: 'National Clearing House', status: '✓ Active', class: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
      ],
      stages: [
        {
          title: 'Stage 1: Application & Document Submission',
          time: 'Authenticated',
          desk: 'State Portal',
          status: 'completed',
          icon: '✓',
          badgeText: 'Received',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          desc: 'Application and attached documents recorded in state database.'
        },
        {
          title: 'Stage 2: Document Scrutiny & De-duplication Check',
          time: 'Active',
          desk: 'Scrutiny Officer',
          status: isFlagged ? 'flagged' : 'in-progress',
          icon: isFlagged ? '⚠️' : '📍',
          badgeText: isFlagged ? 'Flagged' : 'In Scrutiny',
          badgeClass: isFlagged ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse',
          desc: 'Dealing hand verifying attached certificates and eligibility criteria.'
        },
        {
          title: 'Stage 3: Field Inspection & Physical Verification',
          time: 'Scheduled',
          desk: 'Field Desk',
          status: 'pending',
          icon: '○',
          badgeText: 'Pending',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Ground verification report will be submitted by Block Officer.'
        },
        {
          title: 'Stage 4: Sanction Order Approval',
          time: 'Scheduled',
          desk: 'Competent Authority',
          status: 'pending',
          icon: '○',
          badgeText: 'Pending',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Sanction letter issued after field report clearance.'
        },
        {
          title: 'Stage 5: Direct Benefit Transfer (DBT Credit)',
          time: 'Scheduled',
          desk: 'PFMS Gateway',
          status: 'pending',
          icon: '○',
          badgeText: 'Pending',
          badgeClass: 'bg-white/10 text-white/50 border-white/10',
          desc: 'Fund credit initiated upon final sanction order release.'
        }
      ]
    };
    renderTrackApp(fallbackData);
  }

  // Expose to window for inline onclick handlers
  window.sampleAppsData = sampleAppsData;
  window.renderTrackApp = renderTrackApp;
  window.trackSample = function(appId) {
    const input = document.getElementById('homeTrackInput');
    if (input) input.value = appId;
    lookupAndRenderApp(appId);
  };
  window.runHomeTrack = function() {
    const input = document.getElementById('homeTrackInput');
    const val = input ? input.value.trim() : '';
    if (!val) {
      if (input) {
        input.focus();
        input.setAttribute('placeholder', 'Please enter Application ID (e.g. APP/2026/08412)');
      }
      return;
    }
    lookupAndRenderApp(val);
  };

  // Wire Enter key on #homeTrackInput and auto-render initial tracker view
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('homeTrackInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.runHomeTrack();
        }
      });
    }

    // Check URL params for appId: e.g. track.html?appId=APP/2026/08412 or index.html?track=APP/2026/08412#track
    const urlParams = new URLSearchParams(window.location.search);
    const queryAppId = urlParams.get('appId') || urlParams.get('track');
    if (queryAppId) {
      if (input) input.value = queryAppId;
      lookupAndRenderApp(queryAppId);
    }
    // Initially blank: do not pre-fill or auto-render results until user searches or clicks a sample pill
  });
})();




