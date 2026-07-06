import json
import re

with open('staffHandbookCL.md', 'r') as f:
    text = f.read()

parts = text.split('{Title')
handbook_data = {}

for part in parts[1:]:
    title_match = re.search(r'^\s*=\s*["\']([^"\']*)["\']\s*,', part)
    if not title_match:
        continue
    title = title_match.group(1).strip()
    
    content_start = part.find('"', title_match.end()) + 1
    content_end = part.find('"\n,', content_start)
    if content_end == -1:
        content_end = part.find('",', content_start)
    if content_end == -1:
        close_brace = part.rfind('}')
        content_end = part.rfind('"', 0, close_brace)
        
    content = part[content_start:content_end].strip()
    handbook_data[title] = content

# Map the titles to the seed script keys
mapping = {
    'Our Mission & Vision': 'mission_and_vision',
    'The Core Pillars of Summer Camp': 'core_pillars_of_summer_camp',
    'The Aims and Methods of Scouting': 'aims_of_scouting',
    'What Makes A Staff?': 'what_makes_a_staff',
    'The Chain of Command': 'chain_of_command',
    'Age Requirements for Staff Leadership': 'age_requirements_for_staff_leadership',
    # Wait, 'Counselors-in-Training (CITs) & Volunteers' and 'Junior Staff' are not explicitly in the seed script's part pages.
    # The seed script says:
    # { title: 'The Chain of Command', keys: ['chain_of_command', 'age_requirements_for_staff_leadership', 'ncs_certification_roles'] }
    # So the other ones were left out? Or they are separate keys?
    # Actually, seed-handbook.mjs:
    # function pagesForPart(part, source) {
    #   if (part.pages) return part.pages;
    #   return Object.keys(source).map((key) => ({ key }));
    # }
    # Since part.pages is defined for all parts, only those keys are used!
    
    'NCS Certification Roles': 'ncs_certification_roles',
    'Staff Expectations': 'duties',
    'The Rules': 'the_rules',
    'Stress Management and Mental Stability': 'stress_management',
    'Glossary': 'glossary',
    'This Is Your Life': 'this_is_your_life_schedule',
    'Customer Service': 'customer_service',
    
    'Program Areas and Directors': 'program_areas',
    'Making Your Area Appealing': 'teaching_methods',
    'Lesson Plans': 'lesson_plans',
    'Controlling your Classes': 'controlling_your_classes',
    'Teaching Skills': 'teaching_skills',
    'Teaching With E.D.G.E.': 'teaching_with_edge',
    
    'Campfire Guidelines': 'campfires_and_ceremonies',
    'Campfire Performance Fundamentals': 'campfire_performance_fundamentals',
    'Leading Songs': 'leading_songs',
    'The Campfire Arc': 'campfire_arc',
    
    'Severe Weather Preparedness': 'severe_weather_preparedness',
    'Safeguarding Youth': 'safeguarding_youth',
    'The Camp Rules': 'the_camp_lawton_guidelines',
    'Program Area Procedures': 'program_area_procedures',
    'Radios': 'radios',
    'The Kitchen rules': 'kitchen_rules',
    'Pets': 'pets',
    'Laundry': 'laundry',
    'Staff Use of Camp Equipment': 'staff_use_of_camp_equipment',
    'Scout Advancement for Staff': 'scout_advancement_for_staff',
    'Payment of Salaries': 'payment_of_salaries',
    'Leaving Camp': 'leaving_camp',
    'Sign-in / Sign Out': 'sign_in_sign_out',
    'Visitors': 'visitors',
    'Staff Vehicles and Transportation': 'staff_vehicles',
    'Emergency Leave': 'emergency_leave',
    'Worker\'s Compensation': 'workers_compensation',
    'Alcohol, Tobacco, Pornography and Drugs': 'alcohol_tobacco_drugs',
    'Job Performance and Appraisals': 'job_performance',
    'Staff Quarters': 'staff_quarters',
    'Religious Services': 'religious_services',
    'Trading Post': 'trading_post',
    'Recreational Items': 'recreational_items',
    
    'Safety & Injuries': 'health_and_safety',
    'Visitors & Camp Security': 'visitors_camp_security',
    'Missing Person (Code Blue)': 'missing_person',
    'Emergency Alarm Procedures': 'emergency_alarm_procedures',
    'Bear & Wildlife Safety': 'bear_wildlife_safety',
    'Fire': 'fire',
    'Lightning & Severe Thunderstorms': 'lightning_thunderstorms',
    'Armed Intruder / Active Shooter': 'armed_intruder',
    'Fatality Protocol': 'fatality_protocol',
    'Unexpected Incidents': 'unexpected_incidents',
    'Media & Public Relations': 'media_pr',
    'Incident Response Protocols': 'incident_response',
    'Employment Policies and Information': 'legal_policies',
    
    'How To Write Funny': 'how_to_write_funny',
    'Writing Songs': 'writing_songs',
    
    # Wait, 'Songbook Index' is not in markdown! The markdown has 'Songbook' ? Let's check the markdown titles.
    # Ah, the markdown has 'Songbook' as a separate directory of files `songs/*.md`! Wait, no, 'Songbook' title might not exist in markdown, because the songs are files! But the section 'Songbook' might just be introductory text. We'll see.
    'Required Paperwork': 'necessary_paperwork',
    'Packing List': 'packing_list',
    'CAMP LAWTON SUMMER CAMP STAFF COMMITMENT & CODE OF CONDUCT': 'code_of_conduct',
    
    'Leadership Contacts': 'leadership_directory',
    'Camp Mailing Address': 'camp_address',
}

# The seed script also expects 'camp_opening_procedures'. Let's see if there is a title matching that.

# But wait! Look at the pages array in seed script:
# { title: 'How To Do Your Job', keys: ['program_areas', 'teaching_methods'] }
# But if I map 'Lesson Plans', 'Controlling your Classes', 'Teaching Skills', 'Teaching With E.D.G.E.' to their own keys, they won't be included because the seed script only looks for 'program_areas' and 'teaching_methods'!
# Let's concatenate them!

def concat_sections(titles):
    return '\n\n'.join(handbook_data.get(t, '') for t in titles if t in handbook_data)

final_json = {
    'leadership_directory': handbook_data.get('Leadership Contacts', ''),
    'camp_address': handbook_data.get('Camp Mailing Address', ''),
    'part_1_camp_staff_training_and_culture': {
        'mission_and_vision': handbook_data.get('Our Mission & Vision', ''),
        'core_pillars_of_summer_camp': handbook_data.get('The Core Pillars of Summer Camp', ''),
        'aims_of_scouting': handbook_data.get('The Aims and Methods of Scouting', ''),
        'what_makes_a_staff': handbook_data.get('What Makes A Staff?', ''),
        'chain_of_command': concat_sections(['The Chain of Command', 'Counselors-in-Training (CITs) & Volunteers', 'Junior Staff']),
        'age_requirements_for_staff_leadership': handbook_data.get('Age Requirements for Staff Leadership', ''),
        'ncs_certification_roles': handbook_data.get('NCS Certification Roles', ''),
        'duties': handbook_data.get('Staff Expectations', ''),
        'the_rules': handbook_data.get('The Rules', ''),
        'stress_management': handbook_data.get('Stress Management and Mental Stability', ''),
        'glossary': handbook_data.get('Glossary', ''),
        'this_is_your_life_schedule': handbook_data.get('This Is Your Life', ''),
        'customer_service': handbook_data.get('Customer Service', ''),
        'program_areas': handbook_data.get('Program Areas and Directors', ''),
        'teaching_methods': concat_sections(['Making Your Area Appealing', 'Lesson Plans', 'Controlling your Classes', 'Teaching Skills', 'Teaching With E.D.G.E.']),
        'campfires_and_ceremonies': concat_sections(['Campfire Guidelines', 'Campfire Performance Fundamentals', 'Leading Songs', 'The Campfire Arc']),
    },
    'part_2_policies_procedures_guidelines_and_laws': {
        'severe_weather_preparedness': handbook_data.get('Severe Weather Preparedness', ''),
        'safeguarding_youth': handbook_data.get('Safeguarding Youth', ''),
        'the_camp_lawton_guidelines': concat_sections(['The Camp Rules', 'Program Area Procedures', 'Radios', 'The Kitchen rules', 'Pets', 'Laundry', 'Staff Use of Camp Equipment', 'Scout Advancement for Staff', 'Payment of Salaries', 'Leaving Camp', 'Sign-in / Sign Out', 'Visitors', 'Staff Vehicles and Transportation', 'Emergency Leave', 'Worker\'s Compensation', 'Alcohol, Tobacco, Pornography and Drugs', 'Job Performance and Appraisals', 'Staff Quarters', 'Religious Services', 'Trading Post', 'Recreational Items']),
        'health_and_safety': concat_sections(['Safety & Injuries', 'Visitors & Camp Security', 'Missing Person (Code Blue)', 'Emergency Alarm Procedures', 'Bear & Wildlife Safety', 'Fire', 'Lightning & Severe Thunderstorms', 'Armed Intruder / Active Shooter', 'Fatality Protocol', 'Unexpected Incidents', 'Media & Public Relations', 'Incident Response Protocols']),
        'legal_policies': handbook_data.get('Employment Policies and Information', ''),
        'camp_opening_procedures': handbook_data.get('CAMP OPENING PROCEDURES', ''), # check if this exists
    },
    'part_3_campfire_master_class_and_songbook': {
        'how_to_write_funny': handbook_data.get('How To Write Funny', ''),
        'writing_songs': handbook_data.get('Writing Songs', ''),
        'songbook': handbook_data.get('Songbook', ''),
    },
    'part_4_onboarding': {
        'necessary_paperwork': handbook_data.get('Required Paperwork', ''),
        'packing_list': handbook_data.get('Packing List', ''),
        'code_of_conduct': handbook_data.get('CAMP LAWTON SUMMER CAMP STAFF COMMITMENT & CODE OF CONDUCT', ''),
    }
}

with open('Camp_Lawton_Staff_Handbook.json', 'w') as f:
    json.dump(final_json, f, indent=2)

print("Generated Camp_Lawton_Staff_Handbook.json")
