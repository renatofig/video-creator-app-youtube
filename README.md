# Video Creator App

![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)

**Video Creator App** é um poderoso aplicativo de desktop, construído com Electron, projetado para automatizar completamente o processo de criação de vídeos para o YouTube. A ferramenta utiliza Inteligência Artificial para gerar roteiros, buscar notícias, criar imagens e sintetizar narrações, transformando temas pré-definidos ou prompts livres em vídeos prontos para publicação com apenas alguns cliques.

## ✨ Funcionalidades Principais

*   **Roteiros com IA:** Utiliza a API Gemini do Google para criar roteiros únicos e coesos com base em diversos temas, como notícias, curiosidades científicas ou histórias infantis.
*   **Busca de Notícias:** Integra-se com a API de Pesquisa Customizada do Google para coletar as notícias mais recentes sobre temas específicos (Futebol, Pescados), garantindo que o conteúdo seja sempre atual.
*   **Geração de Imagens por IA:** Usa a API da Stability AI para criar imagens de fundo e thumbnails visualmente atraentes e contextualmente relevantes para o roteiro do vídeo.
*   **Narração Realista:** Converte o roteiro gerado em áudio MP3 usando a API Text-to-Speech do Google Cloud, com uma seleção inteligente de vozes para combinar com o tom do conteúdo.
*   **Automação de Edição:** Utiliza FFmpeg para compor automaticamente narração, música de fundo, vídeos de introdução e visuais (incluindo slideshows com efeitos Ken Burns).
*   **Criação de Thumbnails:** Gera automaticamente uma thumbnail para o YouTube, sobrepondo o título do vídeo em uma das imagens criadas pela IA ou em um frame extraído do vídeo de fundo.
*   **Agendamento e Publicação:** Possui um sistema de agendamento flexível que permite programar a criação e o upload de vídeos em horários específicos, de forma diária, semanal ou mensal.
*   **Upload para o YouTube:** Após a criação, o aplicativo pode fazer o upload do vídeo finalizado diretamente para um canal do YouTube especificado, incluindo título, descrição e a thumbnail gerada.

---

## ⚠️ Pré-requisitos de Instalação

Antes de clonar o projeto, você **PRECISA** ter as seguintes ferramentas instaladas no seu computador:

1.  **Git:** O sistema de controle de versão.
    *   [Faça o download aqui](https://git-scm.com/downloads)

2.  **Node.js e npm:** O ambiente de execução para o aplicativo.
    *   [Faça o download aqui (versão LTS recomendada)](https://nodejs.org/)

3.  **Git LFS (Large File Storage):** Essencial para baixar os arquivos de vídeo e executáveis do projeto.
    *   [Faça o download aqui](https://git-lfs.github.com/)
    *   Após instalar, abra um terminal e execute este comando **uma única vez** para configurar o Git LFS no seu sistema:
        ```bash
        git lfs install
        ```

---

## 🚀 Como Instalar e Executar

Com os pré-requisitos instalados, siga estes passos:

1.  **Clone o repositório:**
    Este comando irá baixar o projeto e, em seguida, o Git LFS irá baixar automaticamente todos os arquivos de vídeo e outros arquivos grandes.
    ```bash
    git clone https://github.com/renatofig/video-creator-app-youtube.git
    cd video-creator-app-youtube
    ```

2.  **Instale as dependências do projeto:**
    Este comando lê o `package.json` e baixa todas as bibliotecas necessárias para o projeto funcionar.
    ```bash
    npm install
    ```

3.  **Configure suas chaves de API:**
    *   Inicie o aplicativo uma vez para que ele crie o arquivo `config.json` na sua pasta de dados de usuário (o local será mostrado no log do aplicativo ao iniciar).
    *   Abra o aplicativo, vá para a aba "APIs" e preencha todas as suas chaves de API necessárias (Gemini, Google Search, Stability, etc.).
    *   Configure também as credenciais do YouTube na aba "YouTube".
    *   Clique em "Salvar" para gravar suas chaves no `config.json`.

4.  **Inicie o aplicativo em modo de desenvolvimento:**
    ```bash
    npm start
    ```

---

## 📦 Como Empacotar para Distribuição

Para criar um instalador executável (`.exe`) para o Windows, execute o seguinte comando:

```bash
npm run dist
```

O instalador será criado na pasta `dist` que aparecerá no seu projeto.

---

## 🛠️ Tecnologias Utilizadas

*   **Framework:** [Electron](https://www.electronjs.org/)
*   **Inteligência Artificial:**
    *   [Google Gemini API](https://ai.google.dev/) (Roteiros)
    *   [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech) (Narração)
    *   [Stability AI API](https://platform.stability.ai/) (Imagens)
*   **Processamento de Mídia:** [FFmpeg](https://ffmpeg.org/)
*   **Manipulação de Imagens:** [Sharp](https://sharp.pixelplumbing.com/)
*   **Agendamento:** [node-cron](https://github.com/node-cron/node-cron)
*   **Ambiente de Execução:** [Node.js](https://nodejs.org/)
