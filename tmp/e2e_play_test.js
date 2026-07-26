(async()=>{
  const base='http://localhost:4000';
  const fetch = require('node-fetch');
  const { v4: uuidv4 } = require('uuid');
  try {
    console.log('Logging in...');
    let r = await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'demo@srmist.edu.in',password:'password123'})});
    let j = await r.json();
    if(!r.ok){console.error('Login failed',j);process.exit(1);}const token=j.token;console.log('Token obtained');

    console.log('Creating quiz...');
    r = await fetch(base+'/api/quizzes',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({title:'Demo Quiz'})});
    j = await r.json(); if(!r.ok){console.error('Create quiz failed',j);process.exit(1);}const quizId=j.id;console.log('Quiz created',quizId);

    console.log('Adding question...');
    const question={id:uuidv4(),question_text:'What is 2+2?',question_type:'mcq',time_limit:30,base_points:100,options:[{text:'3',is_correct:false},{text:'4',is_correct:true},{text:'22',is_correct:false}],order_index:0,_isNew:true};
    r = await fetch(base+`/api/quizzes/${quizId}`,{method:'PUT',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({title:'Demo Quiz',questions:[question]})});
    j = await r.json(); if(!r.ok){console.error('Add question failed',j);process.exit(1);}console.log('Question added');

    console.log('Creating session...');
    r = await fetch(base+'/api/sessions',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({quizId:quizId,mode:'NORMAL'})});
    j = await r.json(); if(!r.ok){console.error('Create session failed',j);process.exit(1);}const sessionId=j.id;const joinCode=j.joinCode;console.log('Session created',sessionId,joinCode);

    console.log('Joining as participant...');
    const deviceUuid='test-device-'+Math.random().toString(36).slice(2,8);
    r = await fetch(base+`/api/sessions/${sessionId}/join`,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({joinCode,displayName:'Tester',deviceUuid,consentAt:new Date().toISOString()})});
    j = await r.json(); if(!r.ok){console.error('Join failed',j);process.exit(1);}const participantId=j.participantId;console.log('Joined as',participantId);

    console.log('Fetching play-data...');
    r = await fetch(base+`/api/sessions/${sessionId}/play-data?deviceUuid=${deviceUuid}`,{headers:{'authorization':'Bearer '+token}});
    j = await r.json(); console.log('play-data status',r.status);console.log(JSON.stringify(j,null,2));

    console.log('E2E steps completed');
  } catch(e){console.error('Script error',e);process.exit(1);} 
})();
