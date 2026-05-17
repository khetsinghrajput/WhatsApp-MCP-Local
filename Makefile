install:
	@chmod +x install.sh
	@./install.sh

import:
	@read -p "Chat export .txt file path: " path; \
	read -p "Contact JID (e.g. 923112294157@s.whatsapp.net): " jid; \
	read -p "Contact name: " name; \
	npm run import -- "$$path" "$$jid" "$$name"

.PHONY: install import
