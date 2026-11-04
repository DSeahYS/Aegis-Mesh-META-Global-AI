import re

class CDMParser:
    def __init__(self):
        pass
        
    def parse(self, cdm_text: str) -> dict:
        data = {
            "header": {},
            "metadata": {},
            "data": {},
            "covariances": {}
        }
        
        lines = cdm_text.splitlines()
        current_section = None
        current_object = None
        
        for line in lines:
            line = line.strip()
            if not line or line.startswith('COMMENT'):
                continue
                
            if line == 'META_START':
                current_section = 'metadata'
                continue
            elif line == 'META_STOP':
                current_section = None
                continue
                
            if '=' in line:
                k, v = [x.strip() for x in line.split('=', 1)]
                
                v_clean = re.sub(r'\s*\[.*?\]', '', v).strip()
                
                if k == 'OBJECT':
                    current_object = v_clean
                
                if current_section == 'metadata':
                    if current_object:
                        if current_object not in data["metadata"]:
                            data["metadata"][current_object] = {}
                        data["metadata"][current_object][k] = v_clean
                    else:
                        data["header"][k] = v_clean
                else:
                    if k in ['TCA', 'MISS_DISTANCE', 'RELATIVE_SPEED', 'RELATIVE_POSITION_R', 'RELATIVE_POSITION_T', 'RELATIVE_POSITION_N', 'COLLISION_PROBABILITY']:
                        data["data"][k] = v_clean
                    elif k.startswith('CR_') or k.startswith('CT_') or k.startswith('CN_'):
                        if current_object:
                            if current_object not in data["covariances"]:
                                data["covariances"][current_object] = {}
                            data["covariances"][current_object][k] = v_clean
                    else:
                        if current_object:
                            if current_object not in data["data"]:
                                data["data"][current_object] = {}
                            data["data"][current_object][k] = v_clean
                        else:
                            data["header"][k] = v_clean
                            
        return data
