FROM nginx:1.29.5-alpine

# Kopia konfiguracji nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx będzie proxy
EXPOSE 4386

CMD ["nginx", "-g", "daemon off;"]