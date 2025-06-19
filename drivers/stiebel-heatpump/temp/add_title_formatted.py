import json

def add_title_formatted(flow):
    if 'args' in flow and flow['args']:
        args = flow['args']
        formatted_title = flow['title']['en']
        for arg in args:
            formatted_title += f" [[{arg['name']}]]"
        flow['titleFormatted'] = {"en": formatted_title}
    else:
        flow['titleFormatted'] = {"en": flow['title']['en']}
    return flow

# Laad het JSON-bestand
with open('driver.compose.json', 'r') as file:
    data = json.load(file)

# Voeg titleFormatted toe aan elke flow
for flow in data['flows']:
    flow = add_title_formatted(flow)

# Sla het gewijzigde JSON-bestand op
with open('driver.compose.json', 'w') as file:
    json.dump(data, file, indent=2)

print("titleFormatted properties added successfully.")