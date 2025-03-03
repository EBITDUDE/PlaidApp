from flask import Flask
import logging
import os

app = Flask(__name__, static_url_path='/static', static_folder='static')

# Logging setup
LOG_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'finance_app.log')
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler()]
)

logger = logging.getLogger(__name__)

# Import routes after app is defined
import routes

if __name__ == '__main__':
    logger.info("Starting Personal Finance App")
    app.run(debug=True)