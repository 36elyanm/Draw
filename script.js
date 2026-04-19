(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // DOM
  const uploadCard = $('#uploadCard');
  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');
  const browseBtn = $('#browseBtn');
  const thumbBar = $('#thumbBar');
  const thumbImg = $('#thumbImg');
  const fileName = $('#fileName');
  const fileDims = $('#fileDims');
  const btnChange = $('#btnChange');
  const modeCard = $('#modeCard');
  const tabDraw = $('#tabDraw');
  const tabFold = $('#tabFold');
  const drawCard = $('#drawCard');
  const foldCard = $('#foldCard');
  const canvasCard = $('#canvasCard');
  const mainCanvas = $('#mainCanvas');
  const foldOverlay = $('#foldOverlay');
  const canvasLoader = $('#canvasLoader');
  const actionBar = $('#actionBar');
  const btnReset = $('#btnReset');
  const btnDownload = $('#btnDownload');

  // Draw controls
  const edgeStrength = $('#edgeStrength');
  const edgeVal = $('#edgeVal');
  const lineWeight = $('#lineWeight');
  const lineVal = $('#lineVal');
  const smoothing = $('#smoothing');
  const smoothVal = $('#smoothVal');
  const invertToggle = $('#invertToggle');
  const colorToggle = $('#colorToggle');

  // Fold controls
  const foldCols = $('#foldCols');
  const colVal = $('#colVal');
  const foldRows = $('#foldRows');
  const rowVal = $('#rowVal');
  const guideOpacity = $('#guideOpacity');
  const opacityVal = $('#opacityVal');
  const guideColor = $('#guideColor');
  const numbersToggle = $('#numbersToggle');

  // State
  let originalImage = null;
  let currentMode = 'draw';
  let foldLineStyle = 'dashed';
  let selectedColor = '#FF3B30';
  let processingTimeout = null;

  // ───── Upload ─────
  browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  uploadZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  btnChange.addEventListener('click', () => fileInput.click());

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        thumbImg.src = e.target.result;
        fileName.textContent = file.name;
        fileDims.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
        showUI();
        applyMode();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function showUI() {
    uploadCard.classList.add('hidden');
    thumbBar.classList.remove('hidden');
    modeCard.classList.remove('hidden');
    canvasCard.classList.remove('hidden');
    actionBar.classList.remove('hidden');
    showModeControls();
  }

  function showModeControls() {
    if (currentMode === 'draw') {
      drawCard.classList.remove('hidden');
      foldCard.classList.add('hidden');
    } else {
      drawCard.classList.add('hidden');
      foldCard.classList.remove('hidden');
    }
  }

  // ───── Mode Tabs ─────
  tabDraw.addEventListener('click', () => setMode('draw'));
  tabFold.addEventListener('click', () => setMode('fold'));

  function setMode(mode) {
    currentMode = mode;
    tabDraw.classList.toggle('active', mode === 'draw');
    tabFold.classList.toggle('active', mode === 'fold');
    foldOverlay.classList.toggle('visible', mode === 'fold');
    showModeControls();
    applyMode();
  }

  function applyMode() {
    if (currentMode === 'draw') {
      processSketch();
    } else {
      drawOriginal();
      drawFoldGrid();
    }
  }

  // ───── Sketch Processing ─────
  function processSketch() {
    if (!originalImage) return;
    canvasLoader.classList.remove('hidden');

    // Debounce for slider dragging
    clearTimeout(processingTimeout);
    processingTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        const w = originalImage.naturalWidth;
        const h = originalImage.naturalHeight;
        mainCanvas.width = w;
        mainCanvas.height = h;
        const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(originalImage, 0, 0);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const isColor = colorToggle.checked;
        const inverted = invertToggle.checked;

        // Grayscale
        const gray = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const idx = i * 4;
          gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }

        // Multi-pass Gaussian blur
        let blurred = gray;
        const passes = parseInt(smoothing.value);
        for (let p = 0; p < passes; p++) {
          blurred = gaussianBlur(blurred, w, h);
        }

        // Sobel
        const threshold = parseFloat(edgeStrength.value);
        const weight = parseFloat(lineWeight.value) / 50;
        const edges = new Uint8ClampedArray(w * h * 4);

        const bgVal = inverted ? 0 : 255;
        const fgVal = inverted ? 255 : 0;

        for (let i = 0; i < w * h; i++) {
          edges[i * 4] = bgVal;
          edges[i * 4 + 1] = bgVal;
          edges[i * 4 + 2] = bgVal;
          edges[i * 4 + 3] = 255;
        }

        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const gx =
              -blurred[(y-1)*w+(x-1)] - 2*blurred[y*w+(x-1)] - blurred[(y+1)*w+(x-1)] +
               blurred[(y-1)*w+(x+1)] + 2*blurred[y*w+(x+1)] + blurred[(y+1)*w+(x+1)];
            const gy =
              -blurred[(y-1)*w+(x-1)] - 2*blurred[(y-1)*w+x] - blurred[(y-1)*w+(x+1)] +
               blurred[(y+1)*w+(x-1)] + 2*blurred[(y+1)*w+x] + blurred[(y+1)*w+(x+1)];

            const mag = Math.sqrt(gx * gx + gy * gy);

            if (mag > threshold) {
              const alpha = Math.min(1, (mag / 255) * weight * 2);
              const idx = (y * w + x) * 4;

              if (isColor) {
                const srcIdx = (y * w + x) * 4;
                edges[idx]     = Math.round(data[srcIdx]     * alpha + bgVal * (1 - alpha));
                edges[idx + 1] = Math.round(data[srcIdx + 1] * alpha + bgVal * (1 - alpha));
                edges[idx + 2] = Math.round(data[srcIdx + 2] * alpha + bgVal * (1 - alpha));
              } else {
                edges[idx]     = Math.round(fgVal * alpha + bgVal * (1 - alpha));
                edges[idx + 1] = Math.round(fgVal * alpha + bgVal * (1 - alpha));
                edges[idx + 2] = Math.round(fgVal * alpha + bgVal * (1 - alpha));
              }
              edges[idx + 3] = 255;
            }
          }
        }

        ctx.putImageData(new ImageData(edges, w, h), 0, 0);
        canvasLoader.classList.add('hidden');
      });
    }, 30);
  }

  function gaussianBlur(src, w, h) {
    const out = new Float32Array(w * h);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0, ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += src[(y+ky)*w+(x+kx)] * kernel[ki++];
          }
        }
        out[y*w+x] = sum / 16;
      }
    }
    return out;
  }

  // ───── Fold Grid ─────
  function drawOriginal() {
    if (!originalImage) return;
    mainCanvas.width = originalImage.naturalWidth;
    mainCanvas.height = originalImage.naturalHeight;
    mainCanvas.getContext('2d').drawImage(originalImage, 0, 0);
  }

  function drawFoldGrid() {
    if (!originalImage) return;
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    foldOverlay.width = w;
    foldOverlay.height = h;
    const ctx = foldOverlay.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const cols = parseInt(foldCols.value);
    const rows = parseInt(foldRows.value);
    const opacity = parseInt(guideOpacity.value) / 100;

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = Math.max(1, Math.round(w / 400));
    ctx.globalAlpha = opacity;

    const dashLen = Math.round(w / 50);
    if (foldLineStyle === 'dashed') ctx.setLineDash([dashLen, dashLen * 0.5]);
    else if (foldLineStyle === 'dotted') ctx.setLineDash([3, dashLen * 0.3]);
    else ctx.setLineDash([]);

    for (let i = 1; i < cols; i++) {
      const x = Math.round((w / cols) * i);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 1; i < rows; i++) {
      const y = Math.round((h / rows) * i);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Panel numbers
    if (numbersToggle.checked) {
      ctx.setLineDash([]);
      ctx.globalAlpha = opacity * 0.6;
      const fontSize = Math.max(14, Math.round(Math.min(w / cols, h / rows) / 3.5));
      ctx.font = `600 ${fontSize}px 'Google Sans', sans-serif`;
      ctx.fillStyle = selectedColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Add subtle background circle behind numbers
      let num = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = (w / cols) * c + (w / cols) / 2;
          const cy = (h / rows) * r + (h / rows) / 2;

          // Background circle
          ctx.globalAlpha = opacity * 0.15;
          ctx.beginPath();
          ctx.arc(cx, cy, fontSize * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = selectedColor;
          ctx.fill();

          // Number
          ctx.globalAlpha = opacity * 0.8;
          ctx.fillStyle = selectedColor;
          ctx.fillText(String(num), cx, cy);
          num++;
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  // ───── Control Listeners ─────
  edgeStrength.addEventListener('input', () => { edgeVal.textContent = edgeStrength.value; processSketch(); });
  lineWeight.addEventListener('input', () => { lineVal.textContent = lineWeight.value; processSketch(); });
  smoothing.addEventListener('input', () => { smoothVal.textContent = smoothing.value; processSketch(); });
  invertToggle.addEventListener('change', () => processSketch());
  colorToggle.addEventListener('change', () => processSketch());

  guideOpacity.addEventListener('input', () => { opacityVal.textContent = guideOpacity.value + '%'; drawFoldGrid(); });
  numbersToggle.addEventListener('change', () => drawFoldGrid());

  // Steppers
  $$('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = $('#' + btn.dataset.target);
      const dir = parseInt(btn.dataset.dir);
      let val = parseInt(target.value) + dir;
      val = Math.max(2, Math.min(8, val));
      target.value = val;
      if (btn.dataset.target === 'foldCols') colVal.textContent = val;
      else rowVal.textContent = val;
      drawFoldGrid();
    });
  });

  // Pills
  $$('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      foldLineStyle = pill.dataset.style;
      drawFoldGrid();
    });
  });

  // Color swatches
  $$('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      $$('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      selectedColor = sw.dataset.color;
      guideColor.value = selectedColor;
      drawFoldGrid();
    });
  });

  guideColor.addEventListener('input', () => {
    selectedColor = guideColor.value;
    $$('.swatch').forEach(s => s.classList.remove('active'));
    drawFoldGrid();
  });

  // ───── Actions ─────
  const instructionsCard = $('#instructionsCard');
  const instructionsBody = $('#instructionsBody');
  const instructionsTitle = $('#instructionsTitle');
  const btnGuide = $('#btnGuide');
  const btnPrintSteps = $('#btnPrintSteps');

  btnGuide.addEventListener('click', () => {
    if (!originalImage) return;
    if (currentMode === 'draw') {
      generateDrawSteps();
    } else {
      generateFoldSteps();
    }
    instructionsCard.classList.remove('hidden');
    instructionsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  btnPrintSteps.addEventListener('click', () => window.print());

  function generateDrawSteps() {
    instructionsTitle.textContent = 'How to Draw This — Step by Step';
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    const landscape = w > h;
    const aspect = landscape ? `${(w/h).toFixed(1)}:1 landscape` : `1:${(h/w).toFixed(1)} portrait`;
    const inverted = invertToggle.checked;
    const isColor = colorToggle.checked;
    const sensitivity = parseInt(edgeStrength.value);

    // Analyze image regions
    const regions = analyzeImageRegions(originalImage);

    const colors = ['clr-blue','clr-red','clr-green','clr-yellow','clr-pink','clr-orange','clr-purple'];
    const steps = [];

    // Step 1: Materials
    steps.push({
      title: 'Gather Your Materials',
      desc: `You'll need: ${isColor ? 'colored pencils or markers' : 'a pencil (HB and 2B recommended), an eraser, and a fine-tip pen (0.3mm or 0.5mm)'}. Use ${landscape ? 'landscape' : 'portrait'}-oriented paper (aspect ratio roughly ${aspect}).`,
      tip: 'A kneaded eraser works great for lightening pencil lines without smudging.'
    });

    // Step 2: Layout grid
    steps.push({
      title: 'Lightly Sketch a Layout Grid',
      desc: `Divide your paper into a 3×3 grid using very light pencil lines. This helps you place the major shapes accurately. Look at the reference image and note where key elements sit relative to the grid.`,
      tip: 'Press very lightly — these lines will be erased later.'
    });

    // Step 3: Major shapes
    steps.push({
      title: 'Block In the Major Shapes',
      desc: `Start with the largest, most prominent shapes. ${regions.top} Use simple geometric forms — ovals, rectangles, triangles — to approximate each shape. Don't worry about details yet.`,
    });

    // Step 4: Proportions
    steps.push({
      title: 'Refine Proportions & Outlines',
      desc: `Compare your rough shapes to the reference. Adjust any proportions that look off. ${regions.mid} Gradually carve the geometric blocks into more accurate contours.`,
      tip: 'Hold your pencil at arm\'s length to measure relative proportions against the reference.'
    });

    // Step 5: Key details
    steps.push({
      title: 'Add Key Details & Features',
      desc: `Now add the important internal details — lines, textures, and smaller shapes. ${regions.detail} Follow the edge lines from the sketch preview: the brightest/darkest lines are the strongest edges to prioritize.`,
    });

    // Step 6: Line weight
    steps.push({
      title: 'Vary Your Line Weight',
      desc: `Go over your drawing with your pen or a darker pencil. Use thicker lines for outer contours and edges closest to the viewer. Use thinner, lighter lines for internal details and distant elements. ${sensitivity < 60 ? 'Your sketch has few edges — keep lines minimal and clean.' : sensitivity > 140 ? 'Your sketch is very detailed — use many thin lines to capture all those edges.' : 'Use a mix of bold and delicate lines for a natural look.'}`,
      tip: 'Press harder for thick lines, lighter for thin. Rotate between 0.3mm and 0.5mm pens.'
    });

    // Step 7: Shading or color
    if (isColor) {
      steps.push({
        title: 'Add Color Along the Edges',
        desc: `Using colored pencils or markers, add color following the dominant tones from the original image. ${regions.colors} Layer lightly — you can always add more. Focus color on the edge lines to match the color sketch effect.`,
      });
    } else {
      steps.push({
        title: 'Add Shading & Depth',
        desc: `${inverted ? 'Since this is an inverted (white-on-dark) sketch, shade the background heavily and leave the lines white. Use the side of your pencil for broad dark areas.' : 'Add light hatching or cross-hatching to suggest shadows and depth. Look at the reference: darker areas in the original photo correspond to denser line clusters.'} ${regions.shadow}`,
        tip: 'Hatching lines should follow the form of the surface they describe.'
      });
    }

    // Step 8: Cleanup
    steps.push({
      title: 'Clean Up & Final Touches',
      desc: `Erase any remaining grid lines and stray marks. Darken any lines that are too light. Step back and compare to the reference — add any missing details. ${inverted ? 'For the inverted look, consider using white gel pen on dark paper for the final version.' : 'Sign and date your work!'}`,
      tip: 'Take a photo of your final drawing to compare side-by-side with the app\'s sketch.'
    });

    renderSteps(steps, colors);
  }

  function generateFoldSteps() {
    const cols = parseInt(foldCols.value);
    const rows = parseInt(foldRows.value);
    const totalPanels = cols * rows;
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    const landscape = w > h;

    instructionsTitle.textContent = `How to Fold This — ${cols}×${rows} Grid`;

    const colors = ['clr-blue','clr-green','clr-orange','clr-red','clr-purple','clr-pink','clr-yellow'];
    const steps = [];

    // Step 1: Print
    steps.push({
      title: 'Print Your Image',
      desc: `Print the image (with or without the grid overlay) on a single sheet. Use ${landscape ? 'landscape' : 'portrait'} orientation. For best results, use heavier paper (cardstock or 120+ gsm) so the folds hold well.`,
      tip: 'Click "Save Image" to download the version with the grid overlay, then print that.'
    });

    // Step 2: Score lines
    steps.push({
      title: 'Score the Fold Lines',
      desc: `Using a ruler and a scoring tool (a bone folder, empty ballpoint pen, or butter knife), score all ${cols - 1} vertical lines and ${rows - 1} horizontal lines. This makes the folds crisp and prevents paper from cracking.`,
      tip: 'Place the ruler along each grid line and press firmly but don\'t cut through.'
    });

    // Step 3: Vertical folds
    if (cols > 2) {
      steps.push({
        title: `Make the ${cols - 1} Vertical Folds`,
        desc: `Start with the vertical folds (the ${cols - 1} lines running top to bottom). Fold the first column inward (valley fold), then alternate: mountain fold, valley fold, and so on — creating an accordion/fan pattern. You should end up with ${cols} stacked columns.`,
      });
    } else {
      steps.push({
        title: 'Make the Vertical Fold',
        desc: `Fold the paper in half along the single vertical line. Decide if you want a valley fold (image inside) or mountain fold (image outside) depending on your project.`,
      });
    }

    // Step 4: Horizontal folds
    if (rows > 2) {
      steps.push({
        title: `Make the ${rows - 1} Horizontal Folds`,
        desc: `Now fold along the horizontal lines. Again, alternate valley and mountain folds to create an accordion pattern. After this step, your paper should be folded down to the size of a single panel (1/${totalPanels} of the original).`,
      });
    } else {
      steps.push({
        title: 'Make the Horizontal Fold',
        desc: `Fold along the single horizontal line. Your paper is now folded into ${totalPanels} equal panels.`,
      });
    }

    // Step 5: Panel order
    steps.push({
      title: 'Check the Panel Order',
      desc: `Unfold and refold, checking that the numbered panels (${totalPanels} total) appear in the correct sequence. Panel 1 should be the top-left when fully unfolded. When folded, the front-facing panel determines which part of the image is visible.`,
      tip: 'Number the panels lightly in pencil on the back if it helps you track the order.'
    });

    // Step 6: Use case
    steps.push({
      title: 'Finish & Use',
      desc: `Your folded piece is ready! Use cases: as a compact mailer or card (seal with a sticker), a mini booklet (staple or bind the folded edge), a surprise reveal (unfold to show the full image), or a paper craft element. For a cleaner finish, trim any uneven edges with a craft knife and ruler.`,
    });

    renderSteps(steps, colors);
  }

  function analyzeImageRegions(img) {
    // Sample the image at low resolution for quick analysis
    const size = 64;
    const tmp = document.createElement('canvas');
    tmp.width = size; tmp.height = size;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Analyze brightness distribution
    let topBright = 0, midBright = 0, botBright = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    const third = Math.floor(size / 3);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
        if (y < third) topBright += lum;
        else if (y < third * 2) midBright += lum;
        else botBright += lum;
      }
    }

    const area = size * third;
    topBright /= (area * 255);
    midBright /= (area * 255);
    botBright /= (area * 255);

    const total = size * size;
    rSum /= total; gSum /= total; bSum /= total;

    // Dominant color
    let dominantColor = 'neutral tones';
    if (rSum > gSum + 30 && rSum > bSum + 30) dominantColor = 'warm reds and oranges';
    else if (gSum > rSum + 20 && gSum > bSum + 20) dominantColor = 'greens and natural tones';
    else if (bSum > rSum + 20 && bSum > gSum + 20) dominantColor = 'cool blues and purples';
    else if (rSum > 180 && gSum > 180 && bSum > 180) dominantColor = 'bright, light tones';
    else if (rSum < 80 && gSum < 80 && bSum < 80) dominantColor = 'dark, moody tones';

    const topDesc = topBright > 0.65 ? 'The top portion is bright — likely sky or light background.'
      : topBright < 0.35 ? 'The top area is dark — start with heavier shading there.'
      : 'The top area has mid-tones — use medium pressure for initial shapes.';

    const midDesc = midBright > 0.65 ? 'The middle band is bright — this is likely the focal area with the most contrast.'
      : 'The middle section has the most detail — spend extra time here.';

    const detailDesc = botBright > 0.65 ? 'The bottom is light, so use fewer lines in that region.'
      : 'The bottom has darker tones — add more detail and line density there.';

    const shadowDesc = topBright < midBright ? 'Shadows concentrate toward the top — shade upward.'
      : 'Shadows are heavier in the lower portion — add denser hatching at the bottom.';

    return {
      top: topDesc,
      mid: midDesc,
      detail: detailDesc,
      shadow: shadowDesc,
      colors: `The dominant palette is ${dominantColor} — match those tones first, then layer secondary colors.`
    };
  }

  function renderSteps(steps, colors) {
    instructionsBody.innerHTML = '';
    steps.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'step-item';
      div.style.animationDelay = `${i * 0.08}s`;
      div.innerHTML = `
        <div class="step-number ${colors[i % colors.length]}">${i + 1}</div>
        <div class="step-content">
          <div class="step-title">${step.title}</div>
          <div class="step-desc">${step.desc}</div>
          ${step.tip ? `<div class="step-tip"><span class="material-symbols-rounded">lightbulb</span>${step.tip}</div>` : ''}
        </div>
      `;
      instructionsBody.appendChild(div);
    });
  }

  btnReset.addEventListener('click', () => {
    originalImage = null;
    fileInput.value = '';
    currentMode = 'draw';

    uploadCard.classList.remove('hidden');
    thumbBar.classList.add('hidden');
    modeCard.classList.add('hidden');
    drawCard.classList.add('hidden');
    foldCard.classList.add('hidden');
    canvasCard.classList.add('hidden');
    actionBar.classList.add('hidden');
    instructionsCard.classList.add('hidden');
    foldOverlay.classList.remove('visible');

    tabDraw.classList.add('active');
    tabFold.classList.remove('active');

    // Reset controls
    edgeStrength.value = 80; edgeVal.textContent = '80';
    lineWeight.value = 50; lineVal.textContent = '50';
    smoothing.value = 1; smoothVal.textContent = '1';
    invertToggle.checked = false;
    colorToggle.checked = false;
    foldCols.value = 3; colVal.textContent = '3';
    foldRows.value = 3; rowVal.textContent = '3';
    guideOpacity.value = 70; opacityVal.textContent = '70%';
    numbersToggle.checked = true;
  });

  btnDownload.addEventListener('click', () => {
    if (!originalImage) return;
    const w = mainCanvas.width, h = mainCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(mainCanvas, 0, 0);
    if (currentMode === 'fold' && foldOverlay.classList.contains('visible')) {
      ctx.drawImage(foldOverlay, 0, 0);
    }
    const link = document.createElement('a');
    link.download = `sketchfold-${currentMode}-${Date.now()}.png`;
    link.href = tmp.toDataURL('image/png');
    link.click();
  });
})();
