FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 8080
