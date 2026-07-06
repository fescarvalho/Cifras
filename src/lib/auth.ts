export async function getAuthSession() {
  // Mock da sessão de usuário para proteger rotas mutáveis contra IDOR.
  // Em um ambiente de produção real com NextAuth ou Supabase, isso buscaria 
  // a sessão de forma segura via cookies/headers.
  return {
    user: {
      id: "default_user_123"
    }
  };
}
