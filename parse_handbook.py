import fitz # PyMuPDF
import json
import re

doc = fitz.open('MountainStaffHandbook.pdf')
text = ""
for page in doc:
    text += page.get_text("text") + "\n"

# The text contains the sections. We can use regex to find them.
sections = {
    'mission_and_vision': 'Our Mission & Vision',
    'core_pillars_of_summer_camp': 'The Core Pillars of Summer Camp',
    'aims_of_scouting': 'The Aims of Scouting',
    'methods_of_scouting': 'The Methods of Scouting',
    'what_makes_a_staff': 'WHAT MAKES A STAFF?',
    'chain_of_command': 'The Chain of Command',
    'age_requirements_for_staff_leadership': 'Age Requirements for Staff Leadership',
    'ncs_certification_roles': 'NCS Certification Roles',
    'duties': 'Duties',
    'the_rules': 'The Rules',
    'stress_management': 'Stress Management and Mental Stability',
    'glossary': 'Glossary',
    'this_is_your_life_schedule': 'This Is Your Life',
    'customer_service': 'Customer Service',
    'program_areas': 'Program Areas',
    'teaching_methods': 'Teaching Methods',
    'campfires_and_ceremonies': 'BSA Ceremonies and Campfire Guidance',
    'severe_weather_preparedness': 'Severe Weather Preparedness',
    'safeguarding_youth': 'Safeguarding Youth',
    'the_camp_lawton_guidelines': 'The Camp Lawton Guidelines',
    'health_and_safety': 'HEALTH AND SAFETY',
    'legal_policies': 'LEGAL POLICIES AND INFORMATION',
    'camp_opening_procedures': 'CAMP OPENING PROCEDURES',
    'how_to_write_funny': 'How To Write Funny',
    'writing_songs': 'Writing Songs',
    'songbook': 'Songbook',
    'necessary_paperwork': 'Required Paperwork',
    'packing_list': 'Packing List',
    'code_of_conduct': 'CAMP LAWTON SUMMER CAMP STAFF COMMITMENT & CODE OF CONDUCT'
}

# Find indices of each title
indices = []
for key, title in sections.items():
    idx = text.find(title)
    if idx != -1:
        indices.append((idx, key, title))

indices.sort(key=lambda x: x[0])

data = {
    "leadership_directory": "See Directory",
    "camp_address": "Camp Lawton",
    "part_1_camp_staff_training_and_culture": {},
    "part_2_policies_procedures_guidelines_and_laws": {},
    "part_3_campfire_master_class_and_songbook": {},
    "part_4_onboarding": {}
}

key_to_part = {
    'mission_and_vision': 'part_1_camp_staff_training_and_culture',
    'core_pillars_of_summer_camp': 'part_1_camp_staff_training_and_culture',
    'aims_of_scouting': 'part_1_camp_staff_training_and_culture',
    'methods_of_scouting': 'part_1_camp_staff_training_and_culture',
    'what_makes_a_staff': 'part_1_camp_staff_training_and_culture',
    'chain_of_command': 'part_1_camp_staff_training_and_culture',
    'age_requirements_for_staff_leadership': 'part_1_camp_staff_training_and_culture',
    'ncs_certification_roles': 'part_1_camp_staff_training_and_culture',
    'duties': 'part_1_camp_staff_training_and_culture',
    'the_rules': 'part_1_camp_staff_training_and_culture',
    'stress_management': 'part_1_camp_staff_training_and_culture',
    'glossary': 'part_1_camp_staff_training_and_culture',
    'this_is_your_life_schedule': 'part_1_camp_staff_training_and_culture',
    'customer_service': 'part_1_camp_staff_training_and_culture',
    'program_areas': 'part_1_camp_staff_training_and_culture',
    'teaching_methods': 'part_1_camp_staff_training_and_culture',
    'campfires_and_ceremonies': 'part_1_camp_staff_training_and_culture',
    'severe_weather_preparedness': 'part_2_policies_procedures_guidelines_and_laws',
    'safeguarding_youth': 'part_2_policies_procedures_guidelines_and_laws',
    'the_camp_lawton_guidelines': 'part_2_policies_procedures_guidelines_and_laws',
    'health_and_safety': 'part_2_policies_procedures_guidelines_and_laws',
    'legal_policies': 'part_2_policies_procedures_guidelines_and_laws',
    'camp_opening_procedures': 'part_2_policies_procedures_guidelines_and_laws',
    'how_to_write_funny': 'part_3_campfire_master_class_and_songbook',
    'writing_songs': 'part_3_campfire_master_class_and_songbook',
    'songbook': 'part_3_campfire_master_class_and_songbook',
    'necessary_paperwork': 'part_4_onboarding',
    'packing_list': 'part_4_onboarding',
    'code_of_conduct': 'part_4_onboarding'
}

for i in range(len(indices)):
    idx, key, title = indices[i]
    next_idx = indices[i+1][0] if i + 1 < len(indices) else len(text)
    
    content = text[idx:next_idx].strip()
    part = key_to_part[key]
    data[part][key] = content

with open('Camp_Lawton_Staff_Handbook.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Created JSON!")
