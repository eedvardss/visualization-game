export class RaceResultsUI {
    constructor() {
        this.onClose = null;
        this.results = [];

        this.palette = ['#7cb7ff', '#ff8fa3', '#9effa2', '#ffd37c', '#c58bff', '#7ff0ff', '#ffb4f2', '#7ad0ff'];

        this.overlay = document.createElement('div');
        Object.assign(this.overlay.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(2,4,12,0.92), rgba(10,12,28,0.94))',
            zIndex: '40000',
            color: '#fff',
            fontFamily: 'Inter, Arial, sans-serif',
            padding: '24px'
        });

        this.card = document.createElement('div');
        Object.assign(this.card.style, {
            background: 'linear-gradient(180deg, rgba(25,27,38,0.98), rgba(18,19,28,0.98))',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '18px',
            padding: '24px',
            width: '96%',
            maxWidth: '1080px',
            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
            maxHeight: '90vh',
            overflowY: 'auto'
        });

        const title = document.createElement('h2');
        title.innerText = 'Race Results';
        Object.assign(title.style, {
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em'
        });

        this.subTitle = document.createElement('div');
        this.subTitle.innerText = 'Tap Ready in the lobby to run again.';
        Object.assign(this.subTitle.style, {
            color: '#b4b7c3',
            marginBottom: '12px'
        });

        this.chartWrap = document.createElement('div');
        Object.assign(this.chartWrap.style, {
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '14px',
            padding: '14px',
            marginBottom: '14px'
        });

        this.canvas = document.createElement('canvas');
        this.canvas.width = 980;
        this.canvas.height = 260;
        Object.assign(this.canvas.style, {
            width: '100%',
            display: 'block',
            borderRadius: '10px'
        });
        this.chartWrap.appendChild(this.canvas);

        this.list = document.createElement('div');

        this.closeBtn = document.createElement('button');
        this.closeBtn.innerText = 'Close';
        Object.assign(this.closeBtn.style, {
            marginTop: '16px',
            padding: '12px 18px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: '600',
            background: 'linear-gradient(135deg, #ffffff, #d9dde8)',
            color: '#111'
        });
        this.closeBtn.onclick = () => this.hide();

        this.card.appendChild(title);
        this.card.appendChild(this.chartWrap);
        this.card.appendChild(this.subTitle);
        this.card.appendChild(this.list);
        this.card.appendChild(this.closeBtn);
        this.overlay.appendChild(this.card);
        document.body.appendChild(this.overlay);
    }

    show(results, opts = {}) {
        this.results = results || [];
        this.onClose = opts.onClose || null;
        this.overlay.style.display = 'flex';
        this.renderChart();
        this.renderList();
    }

    hide(silent = false) {
        this.overlay.style.display = 'none';
        if (!silent && this.onClose) this.onClose();
    }

    formatSeconds(seconds) {
        if (!Number.isFinite(seconds)) return '--';
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(2).padStart(5, '0');
        return `${mins}:${secs}`;
    }

    renderList() {
        const sorted = [...this.results].sort((a, b) => {
            if (a.finished && b.finished) return (a.totalTime || Infinity) - (b.totalTime || Infinity);
            if (a.finished) return -1;
            if (b.finished) return 1;
            return (b.lap || 0) - (a.lap || 0);
        });

        this.list.innerHTML = '';

        sorted.forEach((p, idx) => {
            const item = document.createElement('div');
            Object.assign(item.style, {
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '10px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
            });

            const color = `#${(p.color || 0xffffff).toString(16).padStart(6, '0')}`;
            const header = document.createElement('div');
            Object.assign(header.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px'
            });
            header.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:12px;height:12px;border-radius:50%;background:${color};"></div>
                    <strong>#${idx + 1}  ${p.username || 'Driver'}</strong>
                </div>
                <div style="color:#fff;font-weight:700;">${p.finished ? `Total: ${this.formatSeconds(p.totalTime)}` : 'Not finished'}</div>
            `;

            const laps = (p.lapTimes || []).map((t, i) => `<span style="margin-right:12px;">Lap ${i + 1}: <strong>${this.formatSeconds(t)}</strong></span>`).join('');
            const lapRow = document.createElement('div');
            lapRow.style.color = '#d4d7e2';
            lapRow.style.marginBottom = '6px';
            lapRow.innerHTML = laps || '<em>No lap data</em>';

            const best = document.createElement('div');
            best.style.color = '#9aa0b5';
            best.innerHTML = `Best lap: <strong>${this.formatSeconds(p.bestLap)}</strong>`;

            item.appendChild(header);
            item.appendChild(lapRow);
            item.appendChild(best);
            this.list.appendChild(item);
        });
    }

    renderChart() {
    const canvas = this.canvas;
    const results = this.results || [];
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxLapsSeen = Math.max(0, ...results.map(r => (r.lapTimes || []).length));
    if (maxLapsSeen === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '16px Inter, Arial';
        ctx.fillText('No lap data yet', 20, h / 2);
        return;
    }

    const allTimes = results.flatMap(r => r.lapTimes || []).filter(t => typeof t === 'number');
    // Use a slightly safer maxTime to prevent the tallest bar from hitting the top
    const maxTime = Math.max(...allTimes, 1) * 1.05; 

    // --- Layout Constants (Adjusted) ---
    const leftPad = 80; // More space for labels
    const rightPad = 30;
    const bottomPad = 48; // More space for lap labels
    const topPad = 40; // More space for legend/hint
    const plotW = w - leftPad - rightPad;
    const plotH = h - topPad - bottomPad;
    const depth = 12; // Deeper 3D effect
    const gap = 8;
    const slotWidth = plotW / Math.max(maxLapsSeen, 1);
    const barWidth = Math.max(14, slotWidth / (results.length * 0.7) - 4); // Adaptive bar width

    // --- Helper Functions (Updated to use player's color or palette) ---
    const hexToRgb = (hex) => {
        const n = String(hex).startsWith('#') ? String(hex).slice(1) : String(hex).padStart(6, '0');
        const int = parseInt(n, 16);
        return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
    };
    const tint = (hex, amt) => {
        const { r, g, b } = hexToRgb(hex);
        const tr = Math.min(255, Math.max(0, r + amt));
        const tg = Math.min(255, Math.max(0, g + amt));
        const tb = Math.min(255, Math.max(0, b + amt));
        return `rgb(${tr},${tg},${tb})`;
    };

    // --- 1. Background Grid and Border ---
    // Background gradient (subtle vertical light source)
    const grad = ctx.createLinearGradient(0, topPad, 0, topPad + plotH);
    grad.addColorStop(0, 'rgba(255,255,255,0.025)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(leftPad, topPad, plotW, plotH);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(leftPad, topPad, plotW, plotH);

    // --- 2. Y-Axis (Time) Grid Lines and Labels ---
    const steps = 4;
    ctx.fillStyle = '#b4b7c3';
    ctx.font = '12px Inter, Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * maxTime;
        const y = topPad + plotH - (t / maxTime) * plotH;
        
        // Horizontal grid lines (dashed)
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(leftPad, y);
        ctx.lineTo(w - rightPad, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // Labels
        ctx.fillText(`${t.toFixed(1)}s`, leftPad - 10, y + 4);
    }
    ctx.textAlign = 'left';

    // --- 3. X-Axis (Lap) Labels ---
    ctx.fillStyle = '#cdd2e3';
    ctx.font = '14px Inter, Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i < maxLapsSeen; i++) {
        const x = leftPad + i * slotWidth + slotWidth / 2;
        ctx.fillText(`Lap ${i + 1}`, x, h - 18);
    }
    ctx.textAlign = 'left';

    // --- 4. Draw 3D Bars with Enhanced Shading & Drop Shadow ---
    
    // Sort results so shorter (faster) bars are drawn last, ensuring they appear "on top"
    // This adds a subtle sense of competition in the visualization
    const sortedResults = [...results].sort((a, b) => {
        // Average lap time for initial sorting heuristic
        const avgA = (a.lapTimes || []).reduce((sum, t) => sum + t, 0) / Math.max(1, (a.lapTimes || []).length);
        const avgB = (b.lapTimes || []).reduce((sum, t) => sum + t, 0) / Math.max(1, (b.lapTimes || []).length);
        return (avgB || Infinity) - (avgA || Infinity); 
    });

    for (let lapIdx = 0; lapIdx < maxLapsSeen; lapIdx++) {
        const barPad = (slotWidth - barWidth * sortedResults.length) / 2; // Center the group of bars

        sortedResults.forEach((r, playerIdx) => {
            const times = r.lapTimes || [];
            if (lapIdx >= times.length || typeof times[lapIdx] !== 'number') return;
            
            const timeVal = times[lapIdx];
            
            // Determine bar color (use player color, falling back to palette)
            const playerColor = r.color ? `#${String(r.color).padStart(6, '0')}` : this.palette[playerIdx % this.palette.length];
            
            const barH = (timeVal / maxTime) * plotH;
            const y = topPad + plotH - barH;
            
            // Calculate X position
            const baseX = leftPad + lapIdx * slotWidth;
            const x = baseX + barPad + playerIdx * barWidth; 
            
            // --------------------
            // 4a. Draw Drop Shadow (Subtle lift)
            // --------------------
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.moveTo(x + depth * 0.5, y + barH + depth * 0.5);
            ctx.lineTo(x + barWidth + depth * 0.5, y + barH + depth * 0.5);
            ctx.lineTo(x + barWidth + depth * 0.5 + depth, y + barH + depth * 0.5 - depth);
            ctx.lineTo(x + depth + depth * 0.5, y + barH + depth * 0.5 - depth);
            ctx.closePath();
            ctx.fill();


            // --------------------
            // 4b. Draw 3D Bar
            // --------------------

            // i. Side (Darkest shade: -40)
            ctx.fillStyle = tint(playerColor, -40);
            ctx.beginPath();
            ctx.moveTo(x + barWidth, y);
            ctx.lineTo(x + barWidth + depth, y - depth);
            ctx.lineTo(x + barWidth + depth, y - depth + barH);
            ctx.lineTo(x + barWidth, y + barH);
            ctx.closePath();
            ctx.fill();
            
            // ii. Front (Main shade: +0)
            ctx.fillStyle = playerColor;
            ctx.fillRect(x, y, barWidth, barH);

            // iii. Top (Lightest shade: +30)
            ctx.fillStyle = tint(playerColor, 30);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + depth, y - depth);
            ctx.lineTo(x + barWidth + depth, y - depth);
            ctx.lineTo(x + barWidth, y);
            ctx.closePath();
            ctx.fill();

            // --------------------
            // 4c. Time Label (Crisp White)
            // --------------------
            ctx.fillStyle = '#fff';
            ctx.font = '12px Inter, Arial';
            ctx.textAlign = 'center';
            // Adjusted position to be above the 3D top face
            ctx.fillText(timeVal.toFixed(2) + 's', x + barWidth / 2 + depth * 0.5, y - depth - 6); 
            ctx.textAlign = 'left';
        });
    }

    // --- 5. Legend and Hint ---
    let legendX = leftPad;
    const legendY = topPad - 16;
    ctx.font = '12px Inter, Arial';
    // Use all results, not just the ones fitting the palette, but use the player's color
    results.forEach((r, idx) => {
        const color = r.color ? `#${String(r.color).padStart(6, '0')}` : this.palette[idx % this.palette.length];
        
        // Draw the color swatch
        ctx.fillStyle = color;
        ctx.fillRect(legendX, legendY - 8, 14, 10);
        
        // Draw the player name
        ctx.fillStyle = '#ddd';
        ctx.fillText(r.username || 'Driver', legendX + 18, legendY + 1);
        legendX += 120;
    });

    // Hint text placement
    ctx.fillStyle = '#9aa0b5';
    ctx.font = '12px Inter, Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Shorter bars = Faster laps', w - rightPad, topPad + 1);
    ctx.textAlign = 'left';
}

}
