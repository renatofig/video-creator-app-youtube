# Video Creator App

**Video Creator App** é um poderoso e gratuito aplicativo de desktop em PT-BR e EN-US, construído com Electron, projetado para automatizar completamente o processo de criação de vídeos para o YouTube. A ferramenta utiliza Inteligência Artificial para gerar roteiros, buscar notícias, criar imagens e sintetizar narrações, transformando temas pré-definidos ou prompts livres em vídeos prontos para publicação com apenas alguns cliques.

## ✨ Funcionalidades Principais

*   **Geração de Conteúdo Multi-Tema com IA:** Utiliza a API Gemini para criar roteiros únicos sobre diversos temas, como Notícias de Futebol, Notícias de Pescados, Curiosidades Científicas, Historinhas Infantis ou um prompt totalmente livre e personalizável.

*   **Internacionalização (PT-BR / EN-US):** Suporte completo para criação de conteúdo em Português do Brasil e Inglês Americano, adaptando prompts, vozes e textos da interface.

*   **Busca de Notícias em Tempo Real:** Integra-se com a API de Pesquisa do Google para coletar as notícias mais recentes sobre temas específicos, garantindo que o conteúdo seja sempre atual e relevante.

*   **Geração de Mídia Flexível:**
    *   **Imagens com IA:** Utiliza a API da Stability AI para criar imagens de fundo e thumbnails visualmente atraentes e contextualmente relevantes.
    *   **Slideshows Locais:** Monta automaticamente slideshows com efeitos Ken Burns a partir de imagens em pastas locais, organizadas por tema.
    *   **Vídeos de Fundo:** Suporta o uso de vídeos de fundo pré-existentes, também selecionados por tema.

*   **Branding de Vídeo Avançado:**
    *   **Vinhetas e Finalizações:** Permite a composição de introduções (temáticas da pasta + vinheta com logo) e finalizações com logo animado.
    *   **Sobreposição de Logo:** Anima e sobrepõe seu logo (arquivo .png) em vídeos de vinheta ou em fundos gerados dinamicamente.

*   **Narração Realista com IA:** Converte roteiros em áudio MP3 usando a API Text-to-Speech do Google Cloud, com uma seleção inteligente de vozes que se adaptam ao tom e idioma do conteúdo.

*   **Otimização SEO Completa:**
    *   **Títulos e Descrições:** A IA gera títulos e descrições otimizados para busca e engajamento.
    *   **Tags Relevantes:** Gera automaticamente um conjunto de tags de cauda curta e longa para maximizar a visibilidade.
    *   **Thumbnails Personalizadas:** Cria uma thumbnail para o YouTube, sobrepondo o título do vídeo em uma imagem gerada ou em um frame do vídeo de fundo.

*   **Prevenção de Conteúdo Duplicado:** Verifica os títulos dos últimos vídeos do seu canal no YouTube e o histórico da sessão atual para evitar a criação de vídeos sobre tópicos repetidos.

*   **Modo Lote para Múltiplos Canais:** Carrega configurações específicas (`.json`) para cada tema, permitindo que uma única execução em lote publique vídeos em diferentes canais do YouTube, com diferentes pastas de saída, descrições e branding.

*   **Agendamento Detalhado e Automação de Inicialização:**
    *   Crie e envie vídeos imediatamente ou agende execuções em horários específicos, com frequência diária, semanal ou mensal.
    *   Pode ser configurado para iniciar junto com o sistema operacional e começar a automação automaticamente.

*   **Upload Direto para o YouTube:** Após a criação, o aplicativo pode fazer o upload do vídeo finalizado, título, descrição, tags e thumbnail diretamente para o seu canal do YouTube, com a opção de apagar os arquivos locais após o envio bem-sucedido.

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
    *   Abra o aplicativo, vá para a aba "APIs" e preencha todas as suas chaves de API necessárias (Gemini, Google Cloud, Stability, etc.).
    *   Configure também as credenciais do YouTube na aba "YouTube".
    *   Clique em "Salvar" para gravar suas chaves no `config.json`. **Use o botão de Ajuda no app para um guia detalhado sobre como obter cada chave.**

4.  **Inicie o aplicativo em modo de desenvolvimento:**
    ```bash
    npm start
    ```

---

## 📦 Como Empacotar para Distribuição

Para criar um instalador executável (`.exe`) para o Windows, execute o seguinte comando:

```bash
npm run dist
