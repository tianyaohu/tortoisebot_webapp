var app = new Vue({
    el: '#app',
    // storing the state of the page
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        rosbridge_address: 'wss://i-0534cd53ae70b422c.robotigniteacademy.com/0209b84c-f48b-4e08-a7ef-f97390784837/rosbridge/',
        port: '9090',

        //slam mapping
        map_viewer:null,
        mapGridClient:null,
        interval:null,

        // Dragzone Data
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },

        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        }
    },
    // helper methods to connect to ROS
    methods: {
        connect: function() {
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })

            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.connected = true
                this.loading = false

                //init camera
                this.setCamera({
                    suffixHost: '/cameras',
                    topic: '/camera/image_raw',  
                    divID: 'divCamera',  
                });

                //init map viewer
                this.initMapViewer()
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.connected = false
                this.loading = false
                document.getElementById('map').innerHTML = ''
            })
        },

        initMapViewer: function(){
            // init map viewer
            this.mapViewer = new ROS2D.Viewer({
                divID:'map',
                width:420,
                height:360
            })
            // Setup the map client.
            this.mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.mapViewer.scene,
                continuous: true,
            })
            // Scale the canvas to fit to the map
            this.mapGridClient.on('change', () => {
                this.mapViewer.scaleToDimensions(this.mapGridClient.currentGrid.width, this.mapGridClient.currentGrid.height);
                this.mapViewer.shift(this.mapGridClient.currentGrid.pose.position.x, this.mapGridClient.currentGrid.pose.position.y)
            })
        },

        disconnect: function() {
            this.ros.close()
        },
                sendCommand: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: 1, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: 0.5, },
            })
            topic.publish(message)
        },

        // pub speed with parameters for linear x and angular z velocity
        pubSpeed: function(lin_x, ang_z) {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            });
            let message = new ROSLIB.Message({
                linear: { x: lin_x, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: ang_z }
            });
            topic.publish(message);
        },

        startDrag() {
            this.dragging = true
            this.x = this.y = 0
        },
        stopDrag() {
            this.dragging = false
            this.x = this.y = 'no'
            this.dragCircleStyle.display = 'none'
            this.resetJoystickVals()
        },
        doDrag(event) {
            if (this.dragging) {
                this.x = event.offsetX
                this.y = event.offsetY
                let ref = document.getElementById('dragstartzone')
                this.dragCircleStyle.display = 'inline-block'

                let minTop = ref.offsetTop - parseInt(this.dragCircleStyle.height) / 2
                let maxTop = minTop + 200
                let top = this.y + minTop
                this.dragCircleStyle.top = `${top}px`

                let minLeft = ref.offsetLeft - parseInt(this.dragCircleStyle.width) / 2
                let maxLeft = minLeft + 200
                let left = this.x + minLeft
                this.dragCircleStyle.left = `${left}px`

                this.setJoystickVals()
            }
        },
        setJoystickVals() {
            this.joystick.vertical = -1 * ((this.y / 200) - 0.5)
            this.joystick.horizontal = +1 * ((this.x / 200) - 0.5)
            //send joystick speed
            this.pubSpeed(this.joystick.vertical, -1*this.joystick.horizontal)
        },
        resetJoystickVals() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            this.pubSpeed(this.joystick.vertical, this.joystick.horizontal)
        },

        // set camera
        setCamera: function(options) {
            options = options || {};
            let topic = options.topic || '/camera/image_raw';  // Default topic
            let divID = options.divID || 'divCamera';              // Default DIV ID
            let surfix_host = options.suffixHost;                               // Host must be provided, no default

            if (!surfix_host) {
                console.error('Surfix_host parameter is required.');
                return; // Exit the function if no host is provided
            }

            //get domain
            let without_wss = this.rosbridge_address.split('wss://')[1]
            console.log('URL without WSS:', without_wss);

            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            let host = domain + surfix_host

            console.log('Domain:', domain); 
            console.log('Host:', host); 
            let width = options.width || 320;   // Default width
            let height = options.height || 240; // Default height

            let viewer = new MJPEGCANVAS.Viewer({
                divID: divID,
                host: host,
                width: width,
                height: height,
                topic: topic,
                ssl: true,
            });
        },
    },
    mounted() {
        // page is ready
        window.addEventListener('mouseup', this.stopDrag)
    },
})