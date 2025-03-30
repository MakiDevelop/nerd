FROM nginx:alpine

COPY . /usr/share/nginx/html

# 創建自定義nginx配置，處理前端路由並代理API請求
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]