/**
 * PerSona Showcase Site Interactive Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabSwitching();
  initCopyButtons();
  initRagDemo();
  initNavScroll();
});

// 1. Tab Switching for Interactive Demo
function initTabSwitching() {
  const tabs = document.querySelectorAll('.sim-tab');
  const contents = document.querySelectorAll('.sim-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = `tab-${tab.getAttribute('data-tab')}`;
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// 2. Copy-to-Clipboard Handler
function initCopyButtons() {
  const copyBtns = document.querySelectorAll('.copy-btn');

  copyBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.getAttribute('data-copy');
      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btn.querySelector('.copy-text')?.textContent || 'Copy';
        const textSpan = btn.querySelector('.copy-text');
        
        btn.classList.add('copied');
        if (textSpan) textSpan.textContent = 'Copied!';

        setTimeout(() => {
          btn.classList.remove('copied');
          if (textSpan) textSpan.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy to clipboard', err);
      }
    });
  });
}

// 3. Simulated Conversational RAG Demo
const RAG_DATA = {
  security: {
    user: "How does our API authenticate requests?",
    ragSources: "Referenced 2 chunks from: api-specs/auth_gateway.json (p. 4) and arch/security_model.md",
    answer: "Requests to the API are authenticated via **Bearer tokens** or HMAC SHA-256 signatures in the <code>Authorization</code> header. Each incoming token is validated against the local token cache with a 15-minute expiration window before querying the identity provider."
  },
  performance: {
    user: "Summarize our Q3 cluster scaling benchmarks",
    ragSources: "Referenced 3 chunks from: reports/q3_scaling_benchmarks.pdf",
    answer: "In the Q3 benchmarks, the cluster scaled from **3 to 18 worker nodes** under 45,000 req/sec load. Average P99 latency remained under **24ms**, with zero packet drops recorded during horizontal pod autoscaling."
  },
  architecture: {
    user: "List all database tables in the schema",
    ragSources: "Referenced 1 chunk from: src-tauri/src/db.rs",
    answer: "PerSona's local metadata schema consists of the following core tables:\n• <code>threads</code> & <code>messages</code>: Chat conversation history\n• <code>documents</code>: Ingested file paths, hashes, and parsing statuses\n• <code>collections</code>: Knowledge grouping hierarchies\n• <code>agents</code> & <code>skills</code>: Agent personas and synthesized JS tools"
  }
};

function initRagDemo() {
  const container = document.getElementById('sim-messages-container');
  const promptButtons = document.querySelectorAll('.sim-prompt-btn');
  const inputBox = document.getElementById('sim-input-box');

  if (!container) return;

  function renderQuery(queryKey) {
    const data = RAG_DATA[queryKey];
    if (!data) return;

    if (inputBox) {
      inputBox.value = data.user;
    }

    container.innerHTML = `
      <div class="sim-msg sim-msg-user">
        <div class="sim-msg-bubble">${escapeHtml(data.user)}</div>
      </div>
      <div class="sim-msg sim-msg-assistant">
        <div class="sim-msg-bubble">
          <div class="sim-rag-context">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>${data.ragSources}</span>
          </div>
          <div style="margin-top: 10px;">${data.answer}</div>
        </div>
      </div>
    `;
    container.scrollTop = container.scrollHeight;
  }

  promptButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      promptButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const queryKey = btn.getAttribute('data-query');
      renderQuery(queryKey);
    });
  });

  // Render initial query
  renderQuery('security');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 4. Navbar scroll shadow
function initNavScroll() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.style.background = 'rgba(7, 9, 14, 0.9)';
      navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
    } else {
      navbar.style.background = 'rgba(7, 9, 14, 0.75)';
      navbar.style.boxShadow = 'none';
    }
  });
}
