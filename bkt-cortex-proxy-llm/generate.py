import secrets
import string

def generate_secure_key(length=64):
    """
    Genera una clave segura aleatoria usando solo letras y números.
    
    Args:
        length: Longitud de la clave (por defecto 64 caracteres)
        
    Returns:
        Una cadena aleatoria segura
    """
    # Solo letras y números (sin caracteres especiales)
    alphabet = string.ascii_letters + string.digits
    # Generar clave
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# Generar claves
secret_key = generate_secure_key()
proxy_api_key = generate_secure_key()

# Mostrar las claves
print(f"\n=== CLAVES GENERADAS ===\n")
print(f"SECRET_KEY={secret_key}")
print(f"\nPROXY_API_KEY={proxy_api_key}")
print(f"\n=======================\n")
print("Copia estas claves a tu archivo .env (sin comillas)")