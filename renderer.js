// Função global para abas, precisa estar fora do DOMContentLoaded
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "flex";
    evt.currentTarget.className += " active";
}

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO CABEÇALHO E CONTROLE ---
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const helpButton = document.getElementById('helpButton');
    const logArea = document.getElementById('log');
    const youtubeLoginButton = document.getElementById('youtubeLoginButton');

    // --- ELEMENTOS DE CONFIGURAÇÃO ---
    const pathInputs = {
        musicasPath: document.getElementById('musicasPath'),
        introPath: document.getElementById('introPath'),
        backgroundsPath: document.getElementById('backgroundsPath'),
        outputDir: document.getElementById('outputDir')
    };
    const themeCheckboxes = document.querySelectorAll('.theme-checkbox');
    const freeformPromptContainer = document.getElementById('freeform-prompt-container');
    const freeformCheckbox = document.getElementById('theme-freeform');
    
    const startupWinCheckbox = document.getElementById('startupWinCheckbox');
    const startupAutoCheckbox = document.getElementById('startupAutoCheckbox');

    // --- Checkboxes de IA ---
    const randomizeCheckbox = document.getElementById('randomizeBackgroundCheckbox');
    const prioritizeAiCheckbox = document.getElementById('prioritizeAiCheckbox');
    const useAiAsFallbackCheckbox = document.getElementById('useAiAsFallbackCheckbox');
    const aiCheckboxes = [prioritizeAiCheckbox, useAiAsFallbackCheckbox];

    // --- Checkbox de Lote ---
    const batchModeCheckbox = document.getElementById('batchModeCheckbox');

    // --- ELEMENTOS DA JANELA DE AJUDA ---
    const helpModal = document.getElementById('helpModal');
    const closeHelpModal = document.getElementById('closeHelpModal');
    
    // --- ELEMENTOS DO TOOLTIP ---
    const tooltipElement = document.getElementById('custom-tooltip');
    const batchModeLabel = document.getElementById('label-batch-mode');
    const batchModeHelpContent = document.getElementById('help-batch-mode');
    const mediaFoldersLabel = document.getElementById('label-pastas-de-arquivos');
    const mediaFoldersHelpContent = document.getElementById('help-organizing-media');
    
    let currentConfig = {};
    let lastSavedConfigString = '';
    let isCurrentlyDirty = false;
    let videosGenerated = 0;
    let errorsEncountered = 0;

    // --- GERA A GRADE DE HORÁRIOS ---
    const scheduleHoursGrid = document.getElementById('schedule-hours-grid');
    for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, '0');
        const hourItem = document.createElement('div');
        hourItem.className = 'hour-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.id = `hour-${i}`; checkbox.value = i; checkbox.className = 'hour-checkbox';
        const label = document.createElement('label');
        label.htmlFor = `hour-${i}`; label.textContent = `${hour}h`;
        hourItem.appendChild(checkbox); hourItem.appendChild(label);
        scheduleHoursGrid.appendChild(hourItem);
    }

    // --- FUNÇÕES AUXILIARES ---
    function setButtonLoading(button, isLoading) {
        if (!button) return;
        const text = button.querySelector('.btn-text');
        const spinner = button.querySelector('.spinner');
        if (isLoading) {
            button.disabled = true;
            if (text) text.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            button.disabled = false;
            if (text) text.style.display = 'inline-block';
            if (spinner) spinner.style.display = 'none';
        }
    }
    
    function collectUIConfig() {
        const newConfig = {
            youtubeRefreshToken: currentConfig.youtubeRefreshToken,
            youtubeChannelName: currentConfig.youtubeChannelName,
        };
        Object.keys(pathInputs).forEach(key => { newConfig[key] = pathInputs[key].value.trim(); });
        newConfig.geminiApiKey = document.getElementById('geminiApiKey').value;
        newConfig.googleSearchApiKey = document.getElementById('googleSearchApiKey').value;
        newConfig.searchEngineId = document.getElementById('searchEngineId').value;
        newConfig.searchEngineIdPiscare = document.getElementById('searchEngineIdPiscare').value;
        newConfig.youtubeClientId = document.getElementById('youtubeClientId').value;
        newConfig.youtubeClientSecret = document.getElementById('youtubeClientSecret').value;
        
        newConfig.stabilityApiKey = document.getElementById('stabilityApiKey').value;
        newConfig.aiImageCount = parseInt(document.getElementById('aiImageCount').value, 10) || 1;
        newConfig.randomizeBackground = randomizeCheckbox.checked;
        newConfig.prioritizeAiBackground = prioritizeAiCheckbox.checked;
        newConfig.useAiAsFallback = useAiAsFallbackCheckbox.checked;
        newConfig.useAiVideo = false; // Removido da UI, sempre será falso

        newConfig.selectedThemes = Array.from(themeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        newConfig.freeformPrompt = document.getElementById('freeform-prompt-input').value;
        newConfig.freeformStyle = document.getElementById('freeform-style').value;
        newConfig.freeformTone = document.getElementById('freeform-tone').value;
        newConfig.freeformAudience = document.getElementById('freeform-audience').value;

        newConfig.batchMode = batchModeCheckbox.checked;

        newConfig.audioDuration = document.getElementById('audioDuration').value;
        newConfig.uploadToYouTube = document.getElementById('uploadToYouTubeCheckbox').checked;
        newConfig.deleteAfterUpload = document.getElementById('deleteAfterUploadCheckbox').checked;
        newConfig.includeTitleOnThumbnail = document.getElementById('includeTitleOnThumbnailCheckbox').checked;
        newConfig.youtubeDefaultDescription = document.getElementById('youtubeDefaultDescription').value;
        newConfig.scheduleFrequency = document.getElementById('scheduleFrequency').value;
        newConfig.scheduleDayOfWeek = document.getElementById('scheduleDayOfWeek').value;
        newConfig.scheduleDayOfMonth = document.getElementById('scheduleDayOfMonth').value;
        newConfig.selectedHours = Array.from(document.querySelectorAll('.hour-checkbox')).filter(cb => cb.checked).map(cb => parseInt(cb.value));
        
        newConfig.startWithWindows = startupWinCheckbox.checked;
        newConfig.startAutomatically = startupAutoCheckbox.checked;

        return newConfig;
    }

    function populateUI(config) {
        currentConfig = config || {};
        Object.keys(pathInputs).forEach(key => { pathInputs[key].value = currentConfig[key] || ''; });
        document.getElementById('geminiApiKey').value = currentConfig.geminiApiKey || '';
        document.getElementById('googleSearchApiKey').value = currentConfig.googleSearchApiKey || '';
        document.getElementById('searchEngineId').value = currentConfig.searchEngineId || '';
        document.getElementById('searchEngineIdPiscare').value = currentConfig.searchEngineIdPiscare || '';
        document.getElementById('youtubeClientId').value = currentConfig.youtubeClientId || '';
        document.getElementById('youtubeClientSecret').value = currentConfig.youtubeClientSecret || '';
        
        document.getElementById('stabilityApiKey').value = currentConfig.stabilityApiKey || '';
        document.getElementById('aiImageCount').value = currentConfig.aiImageCount || 1;
        randomizeCheckbox.checked = currentConfig.randomizeBackground || false;
        prioritizeAiCheckbox.checked = currentConfig.prioritizeAiBackground || false;
        useAiAsFallbackCheckbox.checked = currentConfig.useAiAsFallback || false;

        batchModeCheckbox.checked = currentConfig.batchMode || false;
        
        randomizeCheckbox.dispatchEvent(new Event('change'));

        const themes = currentConfig.selectedThemes || ['futebol'];
        themeCheckboxes.forEach(cb => { cb.checked = themes.includes(cb.value); });
        freeformCheckbox.dispatchEvent(new Event('change'));
        document.getElementById('freeform-prompt-input').value = currentConfig.freeformPrompt || '';
        document.getElementById('freeform-style').value = currentConfig.freeformStyle || 'Documentário / Narrativo';
        document.getElementById('freeform-tone').value = currentConfig.freeformTone || 'Curioso / Educacional';
        document.getElementById('freeform-audience').value = currentConfig.freeformAudience || '';

        document.getElementById('audioDuration').value = currentConfig.audioDuration || 5;
        document.getElementById('youtubeStatus').textContent = currentConfig.youtubeChannelName ? `Conectado como: ${currentConfig.youtubeChannelName}` : 'Não conectado.';
        document.getElementById('youtubeDefaultDescription').value = currentConfig.youtubeDefaultDescription || '';
        document.getElementById('uploadToYouTubeCheckbox').checked = currentConfig.uploadToYouTube !== false;
        document.getElementById('deleteAfterUploadCheckbox').checked = currentConfig.deleteAfterUpload === true;
        document.getElementById('includeTitleOnThumbnailCheckbox').checked = currentConfig.includeTitleOnThumbnail !== false;
        document.getElementById('uploadToYouTubeCheckbox').dispatchEvent(new Event('change'));
        document.getElementById('scheduleFrequency').value = currentConfig.scheduleFrequency || 'daily';
        document.getElementById('scheduleDayOfWeek').value = currentConfig.scheduleDayOfWeek || '1';
        document.getElementById('scheduleDayOfMonth').value = currentConfig.scheduleDayOfMonth || '1';
        const selectedHours = currentConfig.selectedHours || [];
        document.querySelectorAll('.hour-checkbox').forEach(cb => { cb.checked = selectedHours.includes(parseInt(cb.value)); });
        document.getElementById('scheduleFrequency').dispatchEvent(new Event('change'));

        startupWinCheckbox.checked = currentConfig.startWithWindows || false;
        startupAutoCheckbox.checked = currentConfig.startAutomatically || false;
    }
    
    async function initializeDefaultPaths() {
        const userDataPath = await window.electronAPI.getUserDataPath();
        const defaultMediaPaths = {
            musicasPath: `${userDataPath}/musicas`,
            introPath: `${userDataPath}/introducoes`,
            backgroundsPath: `${userDataPath}/fundos`,
        };

        let pathsWereSet = false;
        Object.keys(defaultMediaPaths).forEach(key => {
            if (pathInputs[key] && !pathInputs[key].value) {
                pathInputs[key].value = defaultMediaPaths[key];
                pathsWereSet = true;
            }
        });
        updateLastSavedState();
    }
    
    function generateCronString() {
        const minute = '0';
        const selectedHours = Array.from(document.querySelectorAll('.hour-checkbox')).filter(cb => cb.checked).map(cb => cb.value);
        if (selectedHours.length === 0) return '';
        const hour = selectedHours.join(',');
        let dayOfMonth = '*', month = '*', dayOfWeek = '*';
        const scheduleFrequency = document.getElementById('scheduleFrequency').value;
        if (scheduleFrequency === 'weekly') dayOfWeek = document.getElementById('scheduleDayOfWeek').value;
        else if (scheduleFrequency === 'monthly') dayOfMonth = document.getElementById('scheduleDayOfMonth').value;
        return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
    }

    function updateLastSavedState() {
        const config = collectUIConfig();
        delete config.youtubeRefreshToken;
        delete config.youtubeChannelName;
        lastSavedConfigString = JSON.stringify(config);
        if (isCurrentlyDirty) {
            isCurrentlyDirty = false;
            window.electronAPI.setDirtyState(false);
        }
    }

    function checkForChanges() {
        const currentConfigForCheck = collectUIConfig();
        delete currentConfigForCheck.youtubeRefreshToken;
        delete currentConfigForCheck.youtubeChannelName;
        const currentConfigString = JSON.stringify(currentConfigForCheck);
        const hasChanged = currentConfigString !== lastSavedConfigString;
        if (hasChanged !== isCurrentlyDirty) {
            isCurrentlyDirty = hasChanged;
            window.electronAPI.setDirtyState(isCurrentlyDirty);
        }
    }

    function triggerAutomation(runImmediately) {
        const latestConfig = collectUIConfig();
        if(!latestConfig.outputDir || !latestConfig.geminiApiKey) {
            logArea.textContent += "ERRO: A 'Pasta de Saída' e a 'Chave da API do Gemini' são obrigatórias para iniciar.\n";
            logArea.scrollTop = logArea.scrollHeight;
            return;
        }
        if (latestConfig.selectedThemes.length === 0) {
            alert('ERRO: Por favor, selecione pelo menos um Tipo de Conteúdo.');
            return;
        }
        
        let themesToRun = [...latestConfig.selectedThemes];
        if (themesToRun.includes('freeform') && !latestConfig.freeformPrompt.trim()) {
            logArea.textContent += "AVISO: 'Prompt Livre' selecionado mas o texto está vazio. Este tema será pulado.\n";
            logArea.scrollTop = logArea.scrollHeight;
            themesToRun = themesToRun.filter(t => t !== 'freeform');
        }

        if (themesToRun.length === 0) {
            alert('ERRO: Nenhum tipo de conteúdo válido foi selecionado para ser gerado.');
            return;
        }
        latestConfig.selectedThemes = themesToRun;

        const finalCronString = generateCronString();
        if (!finalCronString) {
            alert('ERRO: Por favor, selecione pelo menos um horário para o agendamento.');
            return;
        }
        
        const runData = {
            duration: latestConfig.audioDuration,
            schedule: finalCronString,
            upload: latestConfig.uploadToYouTube,
            delete: latestConfig.deleteAfterUpload,
            config: latestConfig,
            runImmediately: runImmediately
        };

        if (runImmediately) {
            window.electronAPI.startAutomation(runData);
        } else {
             window.electronAPI.showStartMenu(runData);
        }
    }
    
    // --- LÓGICA DO TOOLTIP CUSTOMIZADO ---
    function setupTooltipForElement(triggerElement, contentElement) {
        if (!triggerElement || !contentElement || !tooltipElement) return;

        const moveTooltip = (e) => {
            // Posiciona o tooltip perto do cursor, com um deslocamento.
            // Verifica se o tooltip sairá da tela e ajusta sua posição.
            const offsetX = 15;
            const offsetY = 15;
            let x = e.clientX + offsetX;
            let y = e.clientY + offsetY;
            
            if (x + tooltipElement.offsetWidth > window.innerWidth) {
                x = e.clientX - tooltipElement.offsetWidth - offsetX;
            }
            if (y + tooltipElement.offsetHeight > window.innerHeight) {
                y = e.clientY - tooltipElement.offsetHeight - offsetY;
            }

            tooltipElement.style.left = `${x}px`;
            tooltipElement.style.top = `${y}px`;
        };

        triggerElement.addEventListener('mouseenter', (e) => {
            tooltipElement.innerHTML = contentElement.innerHTML;
            tooltipElement.style.display = 'block';
            moveTooltip(e); // Posicionamento inicial
        });

        triggerElement.addEventListener('mouseleave', () => {
            tooltipElement.style.display = 'none';
        });

        triggerElement.addEventListener('mousemove', moveTooltip);
    }
    
    // Inicializa os tooltips para os elementos desejados
    setupTooltipForElement(batchModeLabel, batchModeHelpContent);
    setupTooltipForElement(mediaFoldersLabel, mediaFoldersHelpContent);


    // --- LÓGICA DE EVENTOS ---
    const allConfigInputs = Array.from(document.querySelectorAll('input, select, textarea'));
    allConfigInputs.forEach(input => {
        const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
        input.addEventListener(eventType, checkForChanges);
    });

    randomizeCheckbox.addEventListener('change', () => {
        if (randomizeCheckbox.checked) {
            aiCheckboxes.forEach(cb => {
                cb.checked = false;
                cb.disabled = true;
            });
        } else {
            aiCheckboxes.forEach(cb => {
                cb.disabled = false;
            });
        }
    });

    aiCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                randomizeCheckbox.checked = false;
                randomizeCheckbox.dispatchEvent(new Event('change'));
            }
        });
    });

    startupWinCheckbox.addEventListener('change', () => {
        window.electronAPI.setStartupBehavior(startupWinCheckbox.checked);
    });

    freeformCheckbox.addEventListener('change', () => {
        freeformPromptContainer.style.display = freeformCheckbox.checked ? 'flex' : 'none';
        freeformPromptContainer.style.flexDirection = 'column';
    });

    async function initializeApp() {
        const config = await window.electronAPI.loadDefaultConfig();
        if (config) {
            populateUI(config);
            logArea.textContent += 'Configuração padrão carregada.\n';
            window.electronAPI.setStartupBehavior(config.startWithWindows || false);
        }
        await initializeDefaultPaths();
        document.querySelector(".tab-link.active").click();

        if (startupAutoCheckbox.checked) {
            logArea.textContent += 'Opção "Iniciar Automaticamente" detectada. Tentando iniciar...\n';
            setTimeout(() => {
                setButtonLoading(startButton, true);
                triggerAutomation(true);
            }, 500);
        }
    }
    
    initializeApp();

    document.getElementById('saveDefaultButton').addEventListener('click', () => {
        const configToSave = collectUIConfig();
        window.electronAPI.saveDefaultConfig(configToSave);
        logArea.textContent += 'Configuração padrão salva.\n';
        updateLastSavedState();
    });

    document.getElementById('saveAsButton').addEventListener('click', async () => {
        const configToSave = collectUIConfig();
        const result = await window.electronAPI.saveConfigFileAs(configToSave);
        if (result && result.filePath) {
            logArea.textContent += `Configuração salva em '${result.filePath}'.\n`;
            updateLastSavedState();
        }
    });

    document.getElementById('openConfigButton').addEventListener('click', async () => {
        const result = await window.electronAPI.openConfigFile();
        if (result && result.config) {
            populateUI(result.config);
            await initializeDefaultPaths();
            logArea.textContent += `Configuração '${result.filePath}' carregada.\n`;
        }
    });
    
    Object.keys(pathInputs).forEach(key => {
        const buttonId = `${key}-button`;
        document.getElementById(buttonId).addEventListener('click', async () => {
            const resultPath = await window.electronAPI.selectFolder();
            if (resultPath) {
                pathInputs[key].value = resultPath;
                checkForChanges();
            }
        });
    });

    startButton.addEventListener('click', () => {
        setButtonLoading(startButton, true);
        triggerAutomation(false);
    });

    stopButton.addEventListener('click', () => {
        window.electronAPI.showStopMenu();
        startButton.disabled = false;
        stopButton.disabled = true;
        setButtonLoading(startButton, false);
    });

    document.getElementById('uploadToYouTubeCheckbox').addEventListener('change', (e) => {
        document.getElementById('deleteAfterUploadCheckbox').disabled = !e.target.checked;
        if (!e.target.checked) document.getElementById('deleteAfterUploadCheckbox').checked = false;
    });

    document.getElementById('scheduleFrequency').addEventListener('change', (e) => {
        document.getElementById('weekly-options').style.display = e.target.value === 'weekly' ? 'block' : 'none';
        document.getElementById('monthly-options').style.display = e.target.value === 'monthly' ? 'block' : 'none';
    });
    
    // Listeners dos presets de horário
    document.getElementById('selectAllHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => cb.checked = true);
        checkForChanges();
    });
    document.getElementById('selectNoneHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => cb.checked = false);
        checkForChanges();
    });
    document.getElementById('selectWorkHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => {
            const hour = parseInt(cb.value);
            cb.checked = (hour >= 9 && hour <= 18);
        });
        checkForChanges();
    });
    document.getElementById('selectNightHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => {
            const hour = parseInt(cb.value);
            cb.checked = (hour >= 0 && hour <= 6);
        });
        checkForChanges();
    });

    helpButton.addEventListener('click', () => { helpModal.style.display = 'block'; });
    closeHelpModal.addEventListener('click', () => { helpModal.style.display = 'none'; });
    window.addEventListener('click', (event) => { if (event.target == helpModal) helpModal.style.display = 'none'; });

    window.electronAPI.onAutomationStarted(() => { 
        setButtonLoading(startButton, true); 
        stopButton.disabled = false; 
    });
    window.electronAPI.onLogUpdate((message) => { 
        if (message.includes('Sequência completa finalizada')) {
            setButtonLoading(startButton, false);
            stopButton.disabled = true;
        }
        logArea.textContent += message + '\n'; 
        logArea.scrollTop = logArea.scrollHeight; 
    });
    window.electronAPI.onVideoComplete(() => { videosGenerated++; document.getElementById('videoCounter').textContent = videosGenerated; });
    window.electronAPI.onAutomationError(() => {
        errorsEncountered++;
        document.getElementById('errorCounter').textContent = errorsEncountered;
    });
    window.electronAPI.onConfigUpdated((config) => { 
        logArea.textContent += 'Configuração interna atualizada.\n'; 
        populateUI(config);
        setButtonLoading(youtubeLoginButton, false);
    });
    window.electronAPI.onInvalidSchedule((schedule) => { 
        alert(`ERRO: Formato de agendamento inválido: "${schedule}"`); 
        setButtonLoading(startButton, false);
        stopButton.disabled = true; 
    });
    window.electronAPI.onGetConfig(() => { window.electronAPI.saveDefaultConfig(collectUIConfig()); });

    const splitter = document.getElementById('splitter');
    const topPanels = document.querySelector('.top-panels');
    const container = document.querySelector('.container');
    let isDragging = false;
    splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const containerRect = container.getBoundingClientRect();
        let newTopHeight = e.clientY - containerRect.top;
        if (newTopHeight < 200) newTopHeight = 200;
        if (newTopHeight > container.clientHeight - 150) newTopHeight = container.clientHeight - 150;
        topPanels.style.height = `${newTopHeight}px`;
    });

    youtubeLoginButton.addEventListener('click', () => {
        const clientId = document.getElementById('youtubeClientId').value;
        const clientSecret = document.getElementById('youtubeClientSecret').value;
        if (!clientId || !clientSecret) {
            alert('Por favor, preencha o Client ID e o Client Secret do YouTube primeiro.');
            return;
        }
        setButtonLoading(youtubeLoginButton, true);
        window.electronAPI.youtubeLogin({ clientId, clientSecret });
    });
    document.getElementById('youtubeLogoutButton').addEventListener('click', () => {
        window.electronAPI.youtubeLogout();
    });
});