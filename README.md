# johnny-soft.github.io

Site da johnnySoft — React + Vite, com hero de simulação de fluido em WebGL.

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm run build    # build de produção em dist/
```

## Deploy

Push na branch `main` dispara o workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml),
que faz o build e publica no GitHub Pages.

> **Configuração única**: em _Settings → Pages_ do repositório, defina
> **Source: GitHub Actions**. O domínio customizado (`www.johnnysoft.qzz.io`)
> é preservado via [public/CNAME](public/CNAME).
